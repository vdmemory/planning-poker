"""End-to-end WebSocket tests for Retro Board through FastAPI TestClient (issue #62).

Mirrors test_websocket.py's structure: REST bootstrap, WS auto-join, broadcast,
error replies, kick, close_board.
"""
from __future__ import annotations

import pytest
from tests.conftest import create_retro_board_via_api


# ---------- REST ----------

def test_post_retro_boards_returns_board_participant_state(client):
    data = create_retro_board_via_api(client)
    assert "board_id" in data and "participant_id" in data
    state = data["state"]
    assert state["facilitator_id"] == data["participant_id"]
    assert len(state["participants"]) == 1
    assert state["participants"][0]["nickname"] == "alice"
    assert [c["id"] for c in state["columns"]] == ["mad", "sad", "glad"]


def test_get_retro_board_returns_public_state(client):
    data = create_retro_board_via_api(client)
    r = client.get(f"/api/retro-boards/{data['board_id']}")
    assert r.status_code == 200
    assert r.json()["state"]["id"] == data["board_id"]


def test_get_retro_board_404_when_unknown(client):
    r = client.get("/api/retro-boards/nonexistent")
    assert r.status_code == 404


# ---------- WebSocket connect ----------

def _ws_url(board_id, participant_id, nickname=""):
    qs = f"?participant_id={participant_id}"
    if nickname:
        qs += f"&nickname={nickname}"
    return f"/ws/retro/{board_id}{qs}"


def test_ws_connect_with_existing_participant_id_works(client):
    data = create_retro_board_via_api(client)
    with client.websocket_connect(_ws_url(data["board_id"], data["participant_id"])) as ws:
        joined = ws.receive_json()
        assert joined == {"type": "joined", "participant_id": data["participant_id"]}
        state_msg = ws.receive_json()
        assert state_msg["type"] == "board_state"
        assert state_msg["state"]["id"] == data["board_id"]


def test_ws_auto_join_creates_new_participant_when_only_nickname_given(client):
    data = create_retro_board_via_api(client)
    with client.websocket_connect(_ws_url(data["board_id"], "unknown", "bob")) as ws:
        joined = ws.receive_json()
        assert joined["type"] == "joined"
        new_id = joined["participant_id"]
        assert new_id != data["participant_id"]
        state_msg = ws.receive_json()
        nicknames = {p["nickname"] for p in state_msg["state"]["participants"]}
        assert nicknames == {"alice", "bob"}


def test_ws_rejects_unknown_board(client):
    with client.websocket_connect("/ws/retro/ghost?participant_id=x") as ws:
        msg = ws.receive_json()
        assert msg == {"type": "board_inactive", "reason": "not_found"}
        with pytest.raises(Exception):
            ws.receive_json()


def test_ws_rejects_unknown_participant_without_nickname(client):
    data = create_retro_board_via_api(client)
    with pytest.raises(Exception):
        with client.websocket_connect(_ws_url(data["board_id"], "ghost")) as ws:
            ws.receive_json()


# ---------- WS broadcast: cards & voting ----------

def test_add_card_and_vote_broadcast_state_to_all(client):
    data = create_retro_board_via_api(client)
    with client.websocket_connect(_ws_url(data["board_id"], data["participant_id"])) as ws_a, \
         client.websocket_connect(_ws_url(data["board_id"], "x", "bob")) as ws_b:
        ws_a.receive_json()  # joined
        ws_a.receive_json()  # board_state (alice only)
        bob_joined = ws_b.receive_json()
        bob_id = bob_joined["participant_id"]
        ws_b.receive_json()  # board_state (alice+bob)
        ws_a.receive_json()  # board_state after bob joined

        ws_a.send_json({"type": "add_card", "column_id": "mad", "text": "Too many meetings"})
        for ws in (ws_a, ws_b):
            msg = ws.receive_json()
            assert msg["type"] == "board_state"
            cards = msg["state"]["cards"]
            assert len(cards) == 1
            assert cards[0]["text"] == "Too many meetings"
            card_id = cards[0]["id"]

        ws_b.send_json({"type": "vote_card", "card_id": card_id})
        for ws in (ws_a, ws_b):
            msg = ws.receive_json()
            assert msg["state"]["cards"][0]["votes"] == [bob_id]


def test_edit_and_delete_card(client):
    data = create_retro_board_via_api(client)
    with client.websocket_connect(_ws_url(data["board_id"], data["participant_id"])) as ws:
        ws.receive_json()
        ws.receive_json()

        ws.send_json({"type": "add_card", "column_id": "sad", "text": "original"})
        msg = ws.receive_json()
        card_id = msg["state"]["cards"][0]["id"]

        ws.send_json({"type": "edit_card", "card_id": card_id, "text": "edited"})
        msg = ws.receive_json()
        assert msg["state"]["cards"][0]["text"] == "edited"

        ws.send_json({"type": "delete_card", "card_id": card_id})
        msg = ws.receive_json()
        assert msg["state"]["cards"] == []


# ---------- WS error path ----------

def test_vote_unknown_card_sends_error_to_sender_only(client):
    data = create_retro_board_via_api(client)
    with client.websocket_connect(_ws_url(data["board_id"], data["participant_id"])) as ws:
        ws.receive_json()
        ws.receive_json()
        ws.send_json({"type": "vote_card", "card_id": "ghost"})
        msg = ws.receive_json()
        assert msg == {"type": "error", "message": "Card not found"}


def test_unknown_message_type_sends_error(client):
    data = create_retro_board_via_api(client)
    with client.websocket_connect(_ws_url(data["board_id"], data["participant_id"])) as ws:
        ws.receive_json()
        ws.receive_json()
        ws.send_json({"type": "do_something_weird"})
        msg = ws.receive_json()
        assert msg["type"] == "error"
        assert "Unknown type" in msg["message"]


def test_missing_required_field_sends_error(client):
    data = create_retro_board_via_api(client)
    with client.websocket_connect(_ws_url(data["board_id"], data["participant_id"])) as ws:
        ws.receive_json()
        ws.receive_json()
        ws.send_json({"type": "add_card", "column_id": "mad"})  # no text
        msg = ws.receive_json()
        assert msg["type"] == "error"
        assert "Missing field" in msg["message"]


# ---------- WS timer ----------

def test_timer_start_pause_resume_broadcasts_state(client):
    data = create_retro_board_via_api(client)
    with client.websocket_connect(_ws_url(data["board_id"], data["participant_id"])) as ws:
        ws.receive_json()
        ws.receive_json()

        ws.send_json({"type": "start_timer", "seconds": 300})
        msg = ws.receive_json()
        assert msg["state"]["timer_running"] is True
        assert msg["state"]["timer_ends_at"] is not None

        ws.send_json({"type": "pause_timer"})
        msg = ws.receive_json()
        assert msg["state"]["timer_running"] is False
        assert msg["state"]["timer_remaining_seconds"] is not None


# ---------- WS kick + board_closed ----------

def test_kick_participant_closes_targets_socket_and_broadcasts_state(client):
    data = create_retro_board_via_api(client)
    with client.websocket_connect(_ws_url(data["board_id"], data["participant_id"])) as ws_a, \
         client.websocket_connect(_ws_url(data["board_id"], "x", "bob")) as ws_b:
        ws_a.receive_json()  # joined
        ws_a.receive_json()  # board_state(alice only)
        joined_b = ws_b.receive_json()
        bob_id = joined_b["participant_id"]
        ws_b.receive_json()  # board_state(alice+bob)
        ws_a.receive_json()  # broadcast when bob joined

        ws_a.send_json({"type": "kick_participant", "target_id": bob_id})
        kicked = ws_b.receive_json()
        assert kicked == {"type": "kicked"}
        with pytest.raises(Exception):
            ws_b.receive_json()
        state_msg = ws_a.receive_json()
        assert state_msg["type"] == "board_state"
        assert all(p["id"] != bob_id for p in state_msg["state"]["participants"])


def test_close_board_broadcasts_board_closed(client):
    data = create_retro_board_via_api(client)
    with client.websocket_connect(_ws_url(data["board_id"], data["participant_id"])) as ws_a, \
         client.websocket_connect(_ws_url(data["board_id"], "x", "bob")) as ws_b:
        for w in (ws_a, ws_b):
            w.receive_json(); w.receive_json()
        ws_a.receive_json()  # bob join broadcast

        ws_a.send_json({"type": "close_board"})
        for ws in (ws_a, ws_b):
            msg = ws.receive_json()
            assert msg == {"type": "board_closed", "reason": "creator_left"}

    r = client.get(f"/api/retro-boards/{data['board_id']}")
    assert r.status_code == 404
