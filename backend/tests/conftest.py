"""Shared fixtures.

Two layers of testing:
- **Service-level** (`service` fixture): drives `RoomService` directly with a fresh
  `InMemoryRoomStore`. No HTTP/WS, fastest, used for business-logic tests.
- **HTTP/WS-level** (`client` fixture): boots the full FastAPI app via TestClient,
  shares the module-global store but wipes it between tests.

Both fixtures keep tests independent.
"""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app import store as store_module
from app.main import app
from app.services import RoomService
from app.store import InMemoryRoomStore


@pytest.fixture
def service():
    """Fresh RoomService backed by a fresh in-memory store. No HTTP layer."""
    return RoomService(InMemoryRoomStore())


@pytest.fixture
def client():
    """FastAPI TestClient against the real app. Wipes the module-global store between tests.

    We mutate the existing singleton (`store._rooms.clear()`) instead of replacing the
    binding — `main.py` and `ws_manager.py` import `store` by name, so reassigning the
    module attribute would leave their references pointing at the old instance.
    """
    store_module.store._rooms.clear()
    with TestClient(app) as c:
        yield c
    store_module.store._rooms.clear()


def create_room_via_api(client: TestClient, name: str = "Sprint planning",
                        deck_type: str = "fibonacci", nickname: str = "alice") -> dict:
    """Helper: create room via REST, return {room_id, player_id, state}."""
    resp = client.post("/api/rooms", json={
        "name": name,
        "deck_type": deck_type,
        "facilitator_nickname": nickname,
    })
    assert resp.status_code == 200, resp.text
    return resp.json()
