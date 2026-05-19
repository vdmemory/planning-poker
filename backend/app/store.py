"""Хранилище комнат.

Сейчас — in-memory dict. В будущем легко заменить на Redis, реализовав тот же интерфейс.
"""
from __future__ import annotations

from typing import Optional, Protocol

from .models import Room


class RoomStore(Protocol):
    def get(self, room_id: str) -> Optional[Room]: ...
    def save(self, room: Room) -> None: ...
    def delete(self, room_id: str) -> None: ...
    def all(self) -> list[Room]: ...


class InMemoryRoomStore:
    def __init__(self) -> None:
        self._rooms: dict[str, Room] = {}

    def get(self, room_id: str) -> Optional[Room]:
        return self._rooms.get(room_id)

    def save(self, room: Room) -> None:
        self._rooms[room.id] = room

    def delete(self, room_id: str) -> None:
        self._rooms.pop(room_id, None)

    def all(self) -> list[Room]:
        return list(self._rooms.values())


# Глобальный синглтон для приложения. В тестах легко подменить.
store: RoomStore = InMemoryRoomStore()
