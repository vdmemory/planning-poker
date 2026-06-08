"""Issue #2 — Room lifecycle: timer expiration.

A room is active for `ROOM_LIFETIME` after `create_room` (default 24h). Once
expired:
  - `get_room` raises `RoomError` — so every mutating action (vote, reveal,
    add_issue…) fails as if the room never existed.
  - The cleanup task `cleanup_expired_rooms` removes the room from the store
    and broadcasts `{type: "room_expired"}` to any still-connected client.
  - WebSocket new-connect attempts return close code 4005 (not 4004) — the
    frontend uses this to distinguish "expired" from "not found".

These tests treat the lifetime as configurable (via monkeypatch on
`services.ROOM_LIFETIME`) so we never wait wall-clock seconds.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from app import services as services_module
from app import ws_manager as ws_manager_module
from app.models import DeckType
from app.services import RoomError, RoomService
from app.store import InMemoryRoomStore

from .conftest import create_room_via_api


# ─── Model + service level ────────────────────────────────────────────────────


def test_new_room_default_lifetime_is_24h(service: RoomService) -> None:
    """A fresh room should expire ~24h after creation by default."""
    room, _ = service.create_room("Sprint planning", DeckType.FIBONACCI, "alice")
    delta = room.expires_at - room.created_at
    # Allow a tiny clock-skew tolerance — the two timestamps are captured
    # microseconds apart.
    assert timedelta(hours=23, minutes=59) < delta <= timedelta(hours=24, seconds=1)


def test_room_expires_at_is_in_public_state(service: RoomService) -> None:
    """Frontend needs `expires_at` in the room snapshot to show a countdown."""
    room, _ = service.create_room("Sprint planning", DeckType.FIBONACCI, "alice")
    state = room.public_state()
    assert "expires_at" in state
    # ISO 8601 string round-trips back to the original datetime.
    assert datetime.fromisoformat(state["expires_at"]) == room.expires_at


def test_room_is_expired_returns_true_when_clock_is_past_expires_at(
    service: RoomService,
) -> None:
    room, _ = service.create_room("Sprint planning", DeckType.FIBONACCI, "alice")
    just_before = room.expires_at - timedelta(seconds=1)
    just_after = room.expires_at + timedelta(seconds=1)
    assert room.is_expired(now=just_before) is False
    assert room.is_expired(now=just_after) is True


def test_get_room_raises_after_expiration(
    service: RoomService, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Once expires_at is in the past, get_room treats the room as gone."""
    # New rooms expire instantly.
    monkeypatch.setattr(services_module, "ROOM_LIFETIME", timedelta(seconds=0))
    room, _ = service.create_room("Sprint planning", DeckType.FIBONACCI, "alice")
    with pytest.raises(RoomError, match="has expired"):
        service.get_room(room.id)


def test_voting_in_expired_room_raises(
    service: RoomService, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Mutating actions go through get_room, so they fail on expired rooms."""
    monkeypatch.setattr(services_module, "ROOM_LIFETIME", timedelta(seconds=0))
    room, alice = service.create_room("Sprint planning", DeckType.FIBONACCI, "alice")
    with pytest.raises(RoomError, match="has expired"):
        service.vote(room.id, alice.id, "5")


def test_reveal_in_expired_room_raises(
    service: RoomService, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(services_module, "ROOM_LIFETIME", timedelta(seconds=0))
    room, alice = service.create_room("Sprint planning", DeckType.FIBONACCI, "alice")
    with pytest.raises(RoomError, match="has expired"):
        service.reveal(room.id, alice.id)


def test_add_issue_in_expired_room_raises(
    service: RoomService, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(services_module, "ROOM_LIFETIME", timedelta(seconds=0))
    room, alice = service.create_room("Sprint planning", DeckType.FIBONACCI, "alice")
    with pytest.raises(RoomError, match="has expired"):
        service.add_issue(room.id, alice.id, "Spike auth")


def test_expire_room_removes_it_from_store(service: RoomService) -> None:
    room, _ = service.create_room("Sprint planning", DeckType.FIBONACCI, "alice")
    returned = service.expire_room(room.id)
    assert returned is not None
    assert returned.id == room.id
    assert service.store.get(room.id) is None


def test_expire_room_returns_none_when_already_gone(service: RoomService) -> None:
    assert service.expire_room("never-existed") is None


# ─── REST endpoint ────────────────────────────────────────────────────────────


def test_rest_get_expired_room_returns_404(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    """The REST endpoint reports an expired room as gone (404 from the
    frontend's perspective). The frontend uses this to show the "no longer
    active" overlay on a stale URL."""
    monkeypatch.setattr(services_module, "ROOM_LIFETIME", timedelta(seconds=0))
    data = create_room_via_api(client)
    resp = client.get(f"/api/rooms/{data['room_id']}")
    assert resp.status_code == 404


def test_rest_get_active_room_returns_state_with_expires_at(client) -> None:
    data = create_room_via_api(client)
    resp = client.get(f"/api/rooms/{data['room_id']}")
    assert resp.status_code == 200
    assert "expires_at" in resp.json()["state"]


# ─── WebSocket connect on expired room ────────────────────────────────────────


def test_ws_connect_to_expired_room_closes_with_4005(
    client, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Connecting WS to an expired room closes with code 4005 (distinct from
    4004 which means "no such room ever"). The frontend differentiates between
    these so it can show the right message.

    The server accepts the handshake and then closes — this is the only way
    browser-side `ws.onclose` receives the real code; a server-side close
    BEFORE accept() arrives as 1006 (abnormal close) in the browser. Inside
    TestClient the close lands on the next `receive_*` call.
    """
    from starlette.websockets import WebSocketDisconnect

    monkeypatch.setattr(services_module, "ROOM_LIFETIME", timedelta(seconds=0))
    data = create_room_via_api(client)
    room_id = data["room_id"]
    pid = data["player_id"]
    with client.websocket_connect(f"/ws/{room_id}?player_id={pid}") as ws:
        with pytest.raises(WebSocketDisconnect) as excinfo:
            ws.receive_text()
        assert excinfo.value.code == 4005


def test_ws_connect_to_missing_room_closes_with_4004(client) -> None:
    """Symmetric to the expired case: a room that never existed yields 4004.
    The frontend uses the difference for the "Room not found" vs "Room is no
    longer active" overlay copy."""
    from starlette.websockets import WebSocketDisconnect

    with client.websocket_connect("/ws/never-existed?player_id=x") as ws:
        with pytest.raises(WebSocketDisconnect) as excinfo:
            ws.receive_text()
        assert excinfo.value.code == 4004


# ─── Cleanup task ─────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_cleanup_task_removes_expired_rooms_and_broadcasts(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The background task `cleanup_expired_rooms` should:
        1. detect expired rooms,
        2. broadcast `room_expired` to the manager,
        3. delete the room from the store.
    """
    # Fresh isolated store + service for the task.
    store = InMemoryRoomStore()
    svc = RoomService(store)
    monkeypatch.setattr(services_module, "ROOM_LIFETIME", timedelta(seconds=0))
    # Run the cleanup loop tick on a 0.05s interval (instead of 60s).
    monkeypatch.setattr(ws_manager_module, "EXPIRED_ROOMS_CHECK_INTERVAL_SECONDS", 0.05)
    # Point the module-level store at our isolated one — the cleanup task
    # imports `store` by name and iterates over it.
    monkeypatch.setattr(ws_manager_module, "store", store)
    # Track broadcasts: replace the manager.broadcast coroutine with a spy.
    broadcasts: list[tuple[str, dict]] = []

    async def spy_broadcast(room_id: str, message: dict) -> None:
        broadcasts.append((room_id, message))

    monkeypatch.setattr(ws_manager_module.manager, "broadcast", spy_broadcast)

    # Create a room — it's expired immediately because ROOM_LIFETIME=0.
    room, _ = svc.create_room("Sprint planning", DeckType.FIBONACCI, "alice")

    # Start the cleanup task; let it tick once or twice.
    task = asyncio.create_task(ws_manager_module.cleanup_expired_rooms(svc))
    try:
        # The task sleeps first, then checks. 0.05s interval × 2 = 0.1s waits.
        await asyncio.sleep(0.2)
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass

    # Room is gone from the store, and we broadcast room_expired at least once.
    assert store.get(room.id) is None
    matching = [b for b in broadcasts if b[0] == room.id and b[1]["type"] == "room_expired"]
    assert matching, f"expected a room_expired broadcast for {room.id}; got {broadcasts!r}"
