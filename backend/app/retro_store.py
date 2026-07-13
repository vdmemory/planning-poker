"""Хранилище retro-досок. Мирроит store.py — in-memory dict, тот же Protocol-паттерн."""
from __future__ import annotations

from typing import Optional, Protocol

from .retro_models import RetroBoard


class RetroBoardStore(Protocol):
    def get(self, board_id: str) -> Optional[RetroBoard]: ...
    def save(self, board: RetroBoard) -> None: ...
    def delete(self, board_id: str) -> None: ...
    def all(self) -> list[RetroBoard]: ...


class InMemoryRetroBoardStore:
    def __init__(self) -> None:
        self._boards: dict[str, RetroBoard] = {}

    def get(self, board_id: str) -> Optional[RetroBoard]:
        return self._boards.get(board_id)

    def save(self, board: RetroBoard) -> None:
        self._boards[board.id] = board

    def delete(self, board_id: str) -> None:
        self._boards.pop(board_id, None)

    def all(self) -> list[RetroBoard]:
        return list(self._boards.values())


# Глобальный синглтон. В тестах легко подменить.
store: RetroBoardStore = InMemoryRetroBoardStore()
