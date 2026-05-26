"""WebSocket connection manager + фоновая задача очистки оффлайн-игроков."""
from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import WebSocket

from .services import RoomService
from .store import store

# Grace-период перед удалением игрока, ушедшего в дисконнект.
DISCONNECT_GRACE_SECONDS = 30


class ConnectionManager:
    def __init__(self) -> None:
        # room_id -> {player_id: WebSocket}
        self._connections: dict[str, dict[str, WebSocket]] = {}

    async def connect(self, room_id: str, player_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self._connections.setdefault(room_id, {})[player_id] = websocket

    def disconnect(self, room_id: str, player_id: str) -> None:
        room_conns = self._connections.get(room_id)
        if room_conns:
            room_conns.pop(player_id, None)
            if not room_conns:
                self._connections.pop(room_id, None)

    async def broadcast(self, room_id: str, message: dict) -> None:
        room_conns = self._connections.get(room_id, {})
        payload = json.dumps(message)
        dead: list[str] = []
        for pid, ws in room_conns.items():
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(pid)
        for pid in dead:
            self.disconnect(room_id, pid)

    async def broadcast_except(self, room_id: str, exclude_player_id: str, message: dict) -> None:
        room_conns = self._connections.get(room_id, {})
        payload = json.dumps(message)
        dead: list[str] = []
        for pid, ws in room_conns.items():
            if pid == exclude_player_id:
                continue
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(pid)
        for pid in dead:
            self.disconnect(room_id, pid)

    async def send_to(self, room_id: str, player_id: str, message: dict) -> None:
        ws = self._connections.get(room_id, {}).get(player_id)
        if ws:
            try:
                await ws.send_text(json.dumps(message))
            except Exception:
                self.disconnect(room_id, player_id)


manager = ConnectionManager()


async def cleanup_disconnected_players(service: RoomService) -> None:
    """Фоновая задача: каждые 5 секунд удаляет игроков, которые в дисконнекте > 30 сек."""
    while True:
        await asyncio.sleep(5)
        try:
            now = datetime.now(timezone.utc)
            for room in list(store.all()):
                to_remove: list[str] = []
                for player in list(room.players.values()):
                    if (
                        not player.connected
                        and player.disconnected_at
                        and (now - player.disconnected_at).total_seconds() > DISCONNECT_GRACE_SECONDS
                    ):
                        to_remove.append(player.id)
                for pid in to_remove:
                    service.remove_player(room.id, pid)
                if to_remove:
                    # Шлём обновлённое состояние оставшимся
                    fresh = store.get(room.id)
                    if fresh:
                        await manager.broadcast(
                            room.id,
                            {"type": "room_state", "state": fresh.public_state()},
                        )
        except Exception as e:
            # Не даём упасть всему циклу из-за одной ошибки
            print(f"[cleanup] error: {e}")
