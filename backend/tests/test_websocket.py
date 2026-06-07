"""End-to-end WebSocket tests through FastAPI TestClient.

Exercises the real HTTP + WS stack:
- REST: POST /api/rooms, GET /api/rooms/{id}, GET /healthz
- WS: auto-join via URL, broadcast, error replies, countdown / draw relay,
       kick, close_room, reveal stats payload.
"""
from __future__ import annotations

import json

import pytest
from tests.conftest import create_room_via_api


# TestClient WS has no non-blocking receive — instead, after a "should not arrive" message,
# send a follow-up that *does* arrive, and assert the follow-up is what we get next.


# ---------- REST ----------

def test_healthz(client):
    r = client.get("/healthz")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_post_rooms_returns_room_player_state(client):
    data = create_room_via_api(client)
    assert "room_id" in data and "player_id" in data
    state = data["state"]
    assert state["facilitator_id"] == data["player_id"]
    assert len(state["players"]) == 1
    assert state["players"][0]["nickname"] == "alice"


def test_get_room_returns_public_state(client):
    data = create_room_via_api(client)
    r = client.get(f"/api/rooms/{data['room_id']}")
    assert r.status_code == 200
    assert r.json()["state"]["id"] == data["room_id"]


def test_get_room_404_when_unknown(client):
    r = client.get("/api/rooms/nonexistent")
    assert r.status_code == 404


# ---------- WebSocket connect ----------

def _ws_url(room_id, player_id, nickname=""):
    qs = f"?player_id={player_id}"
    if nickname:
        qs += f"&nickname={nickname}"
    return f"/ws/{room_id}{qs}"


def test_ws_connect_with_existing_player_id_works(client):
    data = create_room_via_api(client)
    with client.websocket_connect(_ws_url(data["room_id"], data["player_id"])) as ws:
        joined = ws.receive_json()
        assert joined == {"type": "joined", "player_id": data["player_id"]}
        state_msg = ws.receive_json()
        assert state_msg["type"] == "room_state"
        assert state_msg["state"]["id"] == data["room_id"]


def test_ws_auto_join_creates_new_player_when_only_nickname_given(client):
    data = create_room_via_api(client)
    with client.websocket_connect(_ws_url(data["room_id"], "unknown", "bob")) as ws:
        joined = ws.receive_json()
        assert joined["type"] == "joined"
        new_player_id = joined["player_id"]
        assert new_player_id != data["player_id"]
        state_msg = ws.receive_json()
        players = {p["nickname"] for p in state_msg["state"]["players"]}
        assert players == {"alice", "bob"}


def test_ws_rejects_unknown_room(client):
    with pytest.raises(Exception):  # WebSocketDisconnect
        with client.websocket_connect("/ws/ghost?player_id=x") as ws:
            ws.receive_json()


def test_ws_rejects_unknown_player_without_nickname(client):
    data = create_room_via_api(client)
    with pytest.raises(Exception):
        with client.websocket_connect(_ws_url(data["room_id"], "ghost")) as ws:
            ws.receive_json()


# ---------- WS broadcast: vote & reveal ----------

def test_voting_and_reveal_broadcast_state_to_all(client):
    data = create_room_via_api(client)
    with client.websocket_connect(_ws_url(data["room_id"], data["player_id"])) as ws_a, \
         client.websocket_connect(_ws_url(data["room_id"], "x", "bob")) as ws_b:
        ws_a.receive_json()  # joined
        ws_a.receive_json()  # room_state (first connect)
        bob_joined = ws_b.receive_json()
        bob_id = bob_joined["player_id"]
        ws_a.receive_json()  # room_state after bob joined
        ws_b.receive_json()  # room_state after bob joined

        # alice votes
        ws_a.send_json({"type": "vote", "card": "5"})
        # both clients should get room_state
        for ws in (ws_a, ws_b):
            msg = ws.receive_json()
            assert msg["type"] == "room_state"
            assert msg["state"]["voted_player_ids"] == [data["player_id"]]
            assert msg["state"]["votes"][data["player_id"]] == "hidden"

        # bob votes
        ws_b.send_json({"type": "vote", "card": "8"})
        for ws in (ws_a, ws_b):
            msg = ws.receive_json()
            assert sorted(msg["state"]["voted_player_ids"]) == sorted([data["player_id"], bob_id])

        # alice reveals — both get stats payload
        ws_a.send_json({"type": "reveal"})
        for ws in (ws_a, ws_b):
            msg = ws.receive_json()
            assert msg["type"] == "room_state"
            assert msg["state"]["revealed"] is True
            assert msg["state"]["votes"][data["player_id"]] == "5"
            assert "stats" in msg
            assert msg["stats"]["total_votes"] == 2
            assert msg["stats"]["average"] == 6.5


# ---------- WS error path ----------

def test_invalid_card_sends_error_to_sender_only(client):
    data = create_room_via_api(client)
    with client.websocket_connect(_ws_url(data["room_id"], data["player_id"])) as ws:
        ws.receive_json()  # joined
        ws.receive_json()  # room_state
        ws.send_json({"type": "vote", "card": "100"})  # not in deck
        msg = ws.receive_json()
        assert msg == {"type": "error", "message": "Invalid card '100' for this deck"}


def test_unknown_message_type_sends_error(client):
    data = create_room_via_api(client)
    with client.websocket_connect(_ws_url(data["room_id"], data["player_id"])) as ws:
        ws.receive_json()
        ws.receive_json()
        ws.send_json({"type": "do_something_weird"})
        msg = ws.receive_json()
        assert msg["type"] == "error"
        assert "Unknown type" in msg["message"]


def test_missing_required_field_sends_error(client):
    data = create_room_via_api(client)
    with client.websocket_connect(_ws_url(data["room_id"], data["player_id"])) as ws:
        ws.receive_json()
        ws.receive_json()
        ws.send_json({"type": "vote"})  # no card
        msg = ws.receive_json()
        assert msg["type"] == "error"
        assert "Missing field" in msg["message"]


# ---------- WS relay (countdown / draw) ----------

def test_countdown_is_relayed_to_all_including_sender(client):
    data = create_room_via_api(client)
    with client.websocket_connect(_ws_url(data["room_id"], data["player_id"])) as ws_a, \
         client.websocket_connect(_ws_url(data["room_id"], "x", "bob")) as ws_b:
        for w in (ws_a, ws_b):
            w.receive_json(); w.receive_json()
        # consume bob-joined broadcast on ws_a (sent only to those connected at the time)
        ws_a.receive_json()

        ws_a.send_json({"type": "countdown", "seconds": 3})
        for ws in (ws_a, ws_b):
            msg = ws.receive_json()
            assert msg == {"type": "countdown", "seconds": 3}


def test_draw_stroke_is_relayed_to_everyone_except_sender(client):
    data = create_room_via_api(client)
    with client.websocket_connect(_ws_url(data["room_id"], data["player_id"])) as ws_a, \
         client.websocket_connect(_ws_url(data["room_id"], "x", "bob")) as ws_b:
        for w in (ws_a, ws_b):
            w.receive_json(); w.receive_json()
        ws_a.receive_json()  # bob-joined broadcast

        ws_a.send_json({"type": "draw_stroke", "points": [[1, 2]]})
        # bob receives the draw event
        msg_b = ws_b.receive_json()
        assert msg_b["type"] == "draw_stroke"
        assert msg_b["player_id"] == data["player_id"]

        # alice does NOT receive draw_stroke. Prove it: send a follow-up vote and assert
        # the next message alice gets is the vote's room_state, not draw_stroke.
        ws_a.send_json({"type": "vote", "card": "5"})
        next_a = ws_a.receive_json()
        assert next_a["type"] == "room_state"


# ---------- WS kick + room_closed ----------

def test_kick_player_closes_targets_socket_and_broadcasts_state(client):
    data = create_room_via_api(client)
    with client.websocket_connect(_ws_url(data["room_id"], data["player_id"])) as ws_a, \
         client.websocket_connect(_ws_url(data["room_id"], "x", "bob")) as ws_b:
        # ws_a: joined, room_state(alice), room_state(alice+bob after bob joins)
        ws_a.receive_json()  # joined
        ws_a.receive_json()  # room_state(alice only)
        # ws_b: joined, room_state(alice+bob)
        joined_b = ws_b.receive_json()
        bob_id = joined_b["player_id"]
        ws_b.receive_json()  # room_state(alice+bob)
        # back to ws_a, consume the broadcast that fired when bob joined
        ws_a.receive_json()

        ws_a.send_json({"type": "kick_player", "target_player_id": bob_id})
        # Bob receives the kicked notice
        kicked = ws_b.receive_json()
        assert kicked == {"type": "kicked"}
        # His socket is closed by the server (receive raises)
        with pytest.raises(Exception):
            ws_b.receive_json()
        # Alice receives the room_state without bob (server also broadcasts a draw_clear first)
        state_msg = ws_a.receive_json()
        if state_msg.get("type") == "draw_clear":
            state_msg = ws_a.receive_json()
        assert state_msg["type"] == "room_state"
        assert all(p["id"] != bob_id for p in state_msg["state"]["players"])


def test_close_room_broadcasts_room_closed(client):
    data = create_room_via_api(client)
    with client.websocket_connect(_ws_url(data["room_id"], data["player_id"])) as ws_a, \
         client.websocket_connect(_ws_url(data["room_id"], "x", "bob")) as ws_b:
        for w in (ws_a, ws_b):
            w.receive_json(); w.receive_json()
        ws_a.receive_json()  # bob join broadcast

        ws_a.send_json({"type": "close_room"})
        for ws in (ws_a, ws_b):
            msg = ws.receive_json()
            assert msg == {"type": "room_closed"}

    # After close, the room is gone
    r = client.get(f"/api/rooms/{data['room_id']}")
    assert r.status_code == 404
