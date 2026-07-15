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


def test_post_retro_boards_defaults_to_extended_template_when_omitted(client):
    # Issue #67 — the extended template is the new default, both in the
    # frontend's picker and in the REST layer itself when a caller omits
    # `template` from the request body entirely.
    r = client.post("/api/retro-boards", json={"name": "X", "facilitator_nickname": "alice"})
    assert r.status_code == 200
    state = r.json()["state"]
    assert state["template"] == "went_well_extended"
    assert [c["title"] for c in state["columns"]] == [
        "What went well", "To improve", "Risks", "Action items", "How do you find the team's processes?",
    ]


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


# ---------- WS grouping & card reactions (issue #62 Phase 2) ----------

def test_group_cards_broadcasts_state_to_all(client):
    data = create_retro_board_via_api(client)
    with client.websocket_connect(_ws_url(data["board_id"], data["participant_id"])) as ws_a, \
         client.websocket_connect(_ws_url(data["board_id"], "x", "bob")) as ws_b:
        ws_a.receive_json()  # joined
        ws_a.receive_json()  # board_state (alice only)
        ws_b.receive_json()  # joined
        ws_b.receive_json()  # board_state (alice+bob)
        ws_a.receive_json()  # broadcast after bob joined

        ws_a.send_json({"type": "add_card", "column_id": "mad", "text": "one"})
        msg = ws_a.receive_json(); ws_b.receive_json()
        card_a = msg["state"]["cards"][0]["id"]

        ws_a.send_json({"type": "add_card", "column_id": "mad", "text": "two"})
        msg = ws_a.receive_json(); ws_b.receive_json()
        card_b = next(c["id"] for c in msg["state"]["cards"] if c["text"] == "two")

        ws_a.send_json({"type": "group_cards", "source_card_id": card_a, "target_card_id": card_b})
        for ws in (ws_a, ws_b):
            msg = ws.receive_json()
            assert msg["type"] == "board_state"
            grouped = next(c for c in msg["state"]["cards"] if c["id"] == card_a)
            assert grouped["group_id"] == card_b

        ws_a.send_json({"type": "ungroup_card", "card_id": card_a})
        msg = ws_a.receive_json()
        ungrouped = next(c for c in msg["state"]["cards"] if c["id"] == card_a)
        assert ungrouped["group_id"] is None


def test_group_cards_cross_column_sends_error(client):
    data = create_retro_board_via_api(client)
    with client.websocket_connect(_ws_url(data["board_id"], data["participant_id"])) as ws:
        ws.receive_json(); ws.receive_json()
        ws.send_json({"type": "add_card", "column_id": "mad", "text": "one"})
        card_a = ws.receive_json()["state"]["cards"][0]["id"]
        ws.send_json({"type": "add_card", "column_id": "sad", "text": "two"})
        msg = ws.receive_json()
        card_b = next(c["id"] for c in msg["state"]["cards"] if c["text"] == "two")

        ws.send_json({"type": "group_cards", "source_card_id": card_a, "target_card_id": card_b})
        msg = ws.receive_json()
        assert msg == {"type": "error", "message": "Cannot group cards from different columns"}


def test_draw_stroke_is_relayed_to_everyone_except_sender(client):
    data = create_retro_board_via_api(client)
    with client.websocket_connect(_ws_url(data["board_id"], data["participant_id"])) as ws_a, \
         client.websocket_connect(_ws_url(data["board_id"], "x", "bob")) as ws_b:
        ws_a.receive_json(); ws_a.receive_json()
        ws_b.receive_json(); ws_b.receive_json()
        ws_a.receive_json()  # bob-joined broadcast

        ws_a.send_json({"type": "draw_stroke", "points": [[1, 2]]})
        msg_b = ws_b.receive_json()
        assert msg_b["type"] == "draw_stroke"
        assert msg_b["player_id"] == data["participant_id"]

        # alice does NOT receive her own draw_stroke — prove it by sending a
        # follow-up action and checking the next message is that, not a relay.
        ws_a.send_json({"type": "add_card", "column_id": "mad", "text": "text"})
        next_a = ws_a.receive_json()
        assert next_a["type"] == "board_state"


def test_react_to_card_broadcasts_to_all_including_sender(client):
    data = create_retro_board_via_api(client)
    with client.websocket_connect(_ws_url(data["board_id"], data["participant_id"])) as ws_a, \
         client.websocket_connect(_ws_url(data["board_id"], "x", "bob")) as ws_b:
        ws_a.receive_json(); ws_a.receive_json()
        ws_b.receive_json(); ws_b.receive_json()
        ws_a.receive_json()  # bob join broadcast

        ws_a.send_json({"type": "add_card", "column_id": "mad", "text": "text"})
        msg = ws_a.receive_json(); ws_b.receive_json()
        card_id = msg["state"]["cards"][0]["id"]

        ws_b.send_json({"type": "react_to_card", "card_id": card_id, "value": "👍"})
        for ws in (ws_a, ws_b):
            msg = ws.receive_json()
            assert msg["type"] == "card_reaction"
            assert msg["card_id"] == card_id
            assert msg["value"] == "👍"
            assert msg["from_nickname"] == "bob"


def test_reaction_broadcasts_to_all_including_sender(client):
    # Issue #68 — header self-reaction, not tied to a card.
    data = create_retro_board_via_api(client)
    with client.websocket_connect(_ws_url(data["board_id"], data["participant_id"])) as ws_a, \
         client.websocket_connect(_ws_url(data["board_id"], "x", "bob")) as ws_b:
        ws_a.receive_json(); ws_a.receive_json()
        ws_b.receive_json(); ws_b.receive_json()
        ws_a.receive_json()  # bob join broadcast

        ws_b.send_json({"type": "reaction", "value": "🎉"})
        for ws in (ws_a, ws_b):
            msg = ws.receive_json()
            assert msg["type"] == "reaction"
            assert msg["value"] == "🎉"
            assert msg["from_nickname"] == "bob"
            assert "card_id" not in msg


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


# ---------- Background: timer auto-expiry ("Time's up") ----------

@pytest.mark.asyncio
async def test_expire_finished_timers_task_auto_pauses_and_broadcasts(monkeypatch: pytest.MonkeyPatch) -> None:
    """The background task `expire_finished_timers` should, once a running
    timer's deadline has passed: flip it to a paused, zero-remaining state
    (same shape as a manual pause at zero) and broadcast the fresh
    `board_state` — this is what lets the frontend's "Time's up" badge and
    hidden Pause/Resume controls stay correct for every connected client,
    not just the one whose own countdown reached zero first.
    """
    import asyncio
    from datetime import timedelta

    from app import retro_ws_manager as retro_ws_manager_module
    from app.retro_models import RetroTemplate
    from app.retro_service import RetroService
    from app.retro_store import InMemoryRetroBoardStore

    store = InMemoryRetroBoardStore()
    svc = RetroService(store)
    monkeypatch.setattr(retro_ws_manager_module, "TIMER_EXPIRY_CHECK_INTERVAL_SECONDS", 0.05)
    monkeypatch.setattr(retro_ws_manager_module, "store", store)

    broadcasts: list[tuple[str, dict]] = []

    async def spy_broadcast(board_id: str, message: dict) -> None:
        broadcasts.append((board_id, message))

    monkeypatch.setattr(retro_ws_manager_module.manager, "broadcast", spy_broadcast)

    board, alice = svc.create_board("X", RetroTemplate.MAD_SAD_GLAD, "alice")
    svc.start_timer(board.id, alice.id, 300)
    board.timer_ends_at = board.timer_ends_at - timedelta(seconds=301)  # already past due

    task = asyncio.create_task(retro_ws_manager_module.expire_finished_timers(svc))
    try:
        await asyncio.sleep(0.2)
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    fresh = store.get(board.id)
    assert fresh.timer_running is False
    assert fresh.timer_remaining_seconds == 0
    assert fresh.timer_ends_at is None

    matching = [b for b in broadcasts if b[0] == board.id and b[1]["type"] == "board_state"]
    assert len(matching) >= 1
    assert matching[0][1]["state"]["timer_running"] is False
    assert matching[0][1]["state"]["timer_remaining_seconds"] == 0
