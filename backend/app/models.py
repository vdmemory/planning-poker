"""Domain models for Planning Poker.

Все данные хранятся в памяти. Структуры сериализуются для отправки клиентам через WebSocket.
"""
from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum
from typing import Optional
from uuid import uuid4

from pydantic import BaseModel, Field


class DeckType(str, Enum):
    FIBONACCI = "fibonacci"
    TSHIRT = "tshirt"


# Колоды. Значения — строки, чтобы поддерживать "?" и T-shirt одинаково.
DECKS: dict[DeckType, list[str]] = {
    DeckType.FIBONACCI: ["0", "1", "2", "3", "5", "8", "13", "21", "34", "55", "89", "?", "☕"],
    DeckType.TSHIRT: ["XS", "S", "M", "L", "XL", "XXL", "?"],
}


class Player(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    nickname: str
    is_facilitator: bool = False
    is_spectator: bool = False
    connected: bool = True
    # Время дисконнекта; если None — игрок онлайн. Используется для cleanup через 30 сек.
    disconnected_at: Optional[datetime] = None


class Issue(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    title: str
    description: str = ""
    link: str = ""
    final_estimate: Optional[str] = None


class Room(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex[:10])
    name: str
    deck_type: DeckType = DeckType.FIBONACCI
    facilitator_id: Optional[str] = None
    players: dict[str, Player] = Field(default_factory=dict)
    issues: list[Issue] = Field(default_factory=list)
    current_issue_id: Optional[str] = None
    # player_id -> card value
    votes: dict[str, str] = Field(default_factory=dict)
    revealed: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    def deck(self) -> list[str]:
        return DECKS[self.deck_type]

    def public_state(self) -> dict:
        """Состояние комнаты для отправки клиентам.

        Если карты ещё не открыты — отдаём только факт голосования, а не значение.
        """
        return {
            "id": self.id,
            "name": self.name,
            "deck_type": self.deck_type.value,
            "deck": self.deck(),
            "facilitator_id": self.facilitator_id,
            "players": [p.model_dump(mode="json") for p in self.players.values()],
            "issues": [i.model_dump() for i in self.issues],
            "current_issue_id": self.current_issue_id,
            "votes": self.votes if self.revealed else {pid: "hidden" for pid in self.votes},
            "voted_player_ids": list(self.votes.keys()),
            "revealed": self.revealed,
        }
