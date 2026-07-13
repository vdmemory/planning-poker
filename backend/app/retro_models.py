"""Domain models for Retro Board (issue #62).

Independent domain from Planning Poker's `models.py` — separate feature on the
same site, not an extension of `Room`. Same in-memory, no-DB, no-accounts
philosophy: a board lives only as long as it's active, then expires.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Optional
from uuid import uuid4

from pydantic import BaseModel, Field


class RetroTemplate(str, Enum):
    MAD_SAD_GLAD = "mad_sad_glad"
    START_STOP_CONTINUE = "start_stop_continue"
    FOUR_LS = "four_ls"


class RetroColumn(BaseModel):
    id: str
    title: str
    color: str


# Column presets per template. Column `id`s are stable strings (not uuids) so
# `add_card` payloads referencing e.g. "mad" stay meaningful across a board's
# lifetime — there's no reorder/customize-columns feature in Phase 1.
RETRO_TEMPLATES: dict[RetroTemplate, list[RetroColumn]] = {
    RetroTemplate.MAD_SAD_GLAD: [
        RetroColumn(id="mad", title="Mad", color="#ef4444"),
        RetroColumn(id="sad", title="Sad", color="#eab308"),
        RetroColumn(id="glad", title="Glad", color="#22c55e"),
    ],
    RetroTemplate.START_STOP_CONTINUE: [
        RetroColumn(id="start", title="Start", color="#22c55e"),
        RetroColumn(id="stop", title="Stop", color="#ef4444"),
        RetroColumn(id="continue", title="Continue", color="#3b82f6"),
    ],
    RetroTemplate.FOUR_LS: [
        RetroColumn(id="liked", title="Liked", color="#22c55e"),
        RetroColumn(id="learned", title="Learned", color="#3b82f6"),
        RetroColumn(id="lacked", title="Lacked", color="#ef4444"),
        RetroColumn(id="longed_for", title="Longed for", color="#8b5cf6"),
    ],
}


class RetroParticipant(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    nickname: str
    is_facilitator: bool = False
    connected: bool = True
    disconnected_at: Optional[datetime] = None
    avatar_color: str = "#3b82f6"


class RetroCard(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    column_id: str
    author_id: str
    text: str
    # participant ids who upvoted. Visible to everyone on the wire, same as
    # Planning Poker's `voted_player_ids` — this is a casual team tool, not a
    # security boundary. `anonymous_mode` only hides the AUTHOR display name
    # (client-side); it never hides who voted or how many votes a card has.
    votes: list[str] = Field(default_factory=list)
    # Issue #62 Phase 2 — drag-to-merge grouping. `None` means standalone (or
    # this card IS the group's head). A non-null value points at the head
    # card's id. Only one level deep: a head's own `group_id` is always None,
    # so resolving a card's head never needs to chase more than one hop.
    group_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RetroBoard(BaseModel):
    id: str = Field(default_factory=lambda: uuid4().hex[:10])
    name: str
    template: RetroTemplate = RetroTemplate.MAD_SAD_GLAD
    columns: list[RetroColumn] = Field(default_factory=list)
    cards: dict[str, RetroCard] = Field(default_factory=dict)
    participants: dict[str, RetroParticipant] = Field(default_factory=dict)
    facilitator_id: Optional[str] = None
    # Issue #62 — hides card authorship from other participants (display-only,
    # see RetroCard.votes comment above: not a server-side secrecy mechanism).
    anonymous_mode: bool = False
    max_votes_per_person: int = 5
    # Timer: either running (`timer_ends_at` set, absolute deadline) or paused
    # (`timer_remaining_seconds` holds the snapshot). Never both at once.
    # Clients compute the live countdown from `timer_ends_at` locally instead
    # of the server ticking every second.
    timer_running: bool = False
    timer_ends_at: Optional[datetime] = None
    timer_remaining_seconds: Optional[int] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc) + timedelta(hours=24)
    )

    def is_expired(self, now: Optional[datetime] = None) -> bool:
        now = now or datetime.now(timezone.utc)
        return now >= self.expires_at

    def votes_used_by(self, participant_id: str) -> int:
        return sum(1 for card in self.cards.values() if participant_id in card.votes)

    def public_state(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "template": self.template.value,
            "columns": [c.model_dump() for c in self.columns],
            "cards": [c.model_dump(mode="json") for c in self.cards.values()],
            "participants": [p.model_dump(mode="json") for p in self.participants.values()],
            "facilitator_id": self.facilitator_id,
            "anonymous_mode": self.anonymous_mode,
            "max_votes_per_person": self.max_votes_per_person,
            "timer_running": self.timer_running,
            "timer_ends_at": self.timer_ends_at.isoformat() if self.timer_ends_at else None,
            "timer_remaining_seconds": self.timer_remaining_seconds,
            "expires_at": self.expires_at.isoformat(),
        }
