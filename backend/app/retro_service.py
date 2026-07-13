"""Сервисный слой Retro Board: вся бизнес-логика. Мирроит services.py.

WebSocket-роутер (main.py) только парсит сообщения и делегирует сюда.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional

from .retro_models import RETRO_TEMPLATES, RetroBoard, RetroCard, RetroParticipant, RetroTemplate
from .retro_store import RetroBoardStore

# Тот же дефолт, что и ROOM_LIFETIME в services.py — модуль-level, чтобы тесты
# могли monkeypatch'ить на короткий интервал.
BOARD_LIFETIME = timedelta(hours=24)


class RetroError(Exception):
    """Бизнес-ошибка (например: only facilitator can start the timer)."""


class RetroService:
    def __init__(self, store: RetroBoardStore) -> None:
        self.store = store

    # ---------- Lifecycle ----------

    def create_board(self, name: str, template: RetroTemplate,
                     facilitator_nickname: str) -> tuple[RetroBoard, RetroParticipant]:
        now = datetime.now(timezone.utc)
        board = RetroBoard(
            name=name,
            template=template,
            columns=list(RETRO_TEMPLATES[template]),
            expires_at=now + BOARD_LIFETIME,
        )
        facilitator = RetroParticipant(nickname=facilitator_nickname, is_facilitator=True)
        board.facilitator_id = facilitator.id
        board.participants[facilitator.id] = facilitator
        self.store.save(board)
        return board, facilitator

    def get_board(self, board_id: str) -> RetroBoard:
        """Return an active board. Raises `RetroError` if missing or expired.

        Same reasoning as `RoomService.get_room`: treating an expired board as
        not-existing makes every mutation fail fast without per-method checks.
        """
        board = self.store.get(board_id)
        if not board:
            raise RetroError(f"Board {board_id} not found")
        if board.is_expired():
            raise RetroError(f"Board {board_id} has expired")
        return board

    def expire_board(self, board_id: str) -> Optional[RetroBoard]:
        board = self.store.get(board_id)
        if not board:
            return None
        self.store.delete(board_id)
        return board

    # ---------- Participants ----------

    def join(self, board_id: str, nickname: str) -> RetroParticipant:
        board = self.get_board(board_id)
        participant = RetroParticipant(nickname=nickname)
        board.participants[participant.id] = participant
        self.store.save(board)
        return participant

    def reconnect(self, board_id: str, participant_id: str, nickname: str = "") -> Optional[RetroParticipant]:
        board = self.get_board(board_id)
        participant = board.participants.get(participant_id)
        if not participant:
            return None
        participant.connected = True
        participant.disconnected_at = None
        if nickname:
            participant.nickname = nickname
        self.store.save(board)
        return participant

    def update_nickname(self, board_id: str, participant_id: str, nickname: str) -> None:
        board = self.get_board(board_id)
        participant = board.participants.get(participant_id)
        if not participant:
            raise RetroError("Participant not found")
        participant.nickname = nickname.strip() or participant.nickname
        self.store.save(board)

    def update_avatar_color(self, board_id: str, participant_id: str, color: str) -> None:
        board = self.get_board(board_id)
        participant = board.participants.get(participant_id)
        if not participant:
            raise RetroError("Participant not found")
        participant.avatar_color = color
        self.store.save(board)

    def update_board(self, board_id: str, participant_id: str, name: Optional[str] = None,
                     anonymous_mode: Optional[bool] = None,
                     max_votes_per_person: Optional[int] = None) -> None:
        board = self.get_board(board_id)
        self._require_facilitator(board, participant_id)
        if name is not None:
            board.name = name.strip() or board.name
        if anonymous_mode is not None:
            board.anonymous_mode = anonymous_mode
        if max_votes_per_person is not None:
            if max_votes_per_person < 1:
                raise RetroError("max_votes_per_person must be at least 1")
            board.max_votes_per_person = max_votes_per_person
        self.store.save(board)

    def kick_participant(self, board_id: str, participant_id: str, target_id: str) -> None:
        board = self.get_board(board_id)
        self._require_facilitator(board, participant_id)
        if target_id == participant_id:
            raise RetroError("Cannot kick yourself")
        self.remove_participant(board_id, target_id)

    def mark_disconnected(self, board_id: str, participant_id: str) -> bool:
        board = self.store.get(board_id)
        if not board or participant_id not in board.participants:
            return False
        participant = board.participants[participant_id]
        participant.connected = False
        participant.disconnected_at = datetime.now(timezone.utc)
        self.store.save(board)
        return True

    def remove_participant(self, board_id: str, participant_id: str) -> None:
        """Remove a participant (grace-timeout cleanup, kick, or disconnect).

        Facilitator handoff mirrors `RoomService.remove_player`: if the
        facilitator drops, the role passes to the first remaining
        participant. Unlike Planning Poker there's no `close_on_facilitator_leave`
        opt-out for Phase 1 — always hands off, or deletes the board if empty.
        """
        board = self.store.get(board_id)
        if not board:
            return
        was_facilitator = board.facilitator_id == participant_id
        board.participants.pop(participant_id, None)
        for card in board.cards.values():
            if participant_id in card.votes:
                card.votes.remove(participant_id)

        if was_facilitator and board.participants:
            new_facilitator = next(iter(board.participants.values()))
            new_facilitator.is_facilitator = True
            board.facilitator_id = new_facilitator.id

        if not board.participants:
            self.store.delete(board_id)
        else:
            self.store.save(board)

    def close_board(self, board_id: str, participant_id: str) -> None:
        board = self.get_board(board_id)
        self._require_facilitator(board, participant_id)
        self.store.delete(board_id)

    # ---------- Cards ----------

    def add_card(self, board_id: str, participant_id: str, column_id: str, text: str) -> RetroCard:
        board = self.get_board(board_id)
        if participant_id not in board.participants:
            raise RetroError("Participant not in board")
        if not any(c.id == column_id for c in board.columns):
            raise RetroError(f"Invalid column '{column_id}' for this board")
        text = text.strip()
        if not text:
            raise RetroError("Card text cannot be empty")
        card = RetroCard(column_id=column_id, author_id=participant_id, text=text)
        board.cards[card.id] = card
        self.store.save(board)
        return card

    def edit_card(self, board_id: str, participant_id: str, card_id: str, text: str) -> None:
        board = self.get_board(board_id)
        card = board.cards.get(card_id)
        if not card:
            raise RetroError("Card not found")
        self._require_card_owner_or_facilitator(board, participant_id, card)
        text = text.strip()
        if not text:
            raise RetroError("Card text cannot be empty")
        card.text = text
        self.store.save(board)

    def delete_card(self, board_id: str, participant_id: str, card_id: str) -> None:
        board = self.get_board(board_id)
        card = board.cards.get(card_id)
        if not card:
            raise RetroError("Card not found")
        self._require_card_owner_or_facilitator(board, participant_id, card)
        del board.cards[card_id]
        self.store.save(board)

    def vote_card(self, board_id: str, participant_id: str, card_id: str) -> None:
        board = self.get_board(board_id)
        if participant_id not in board.participants:
            raise RetroError("Participant not in board")
        card = board.cards.get(card_id)
        if not card:
            raise RetroError("Card not found")
        if participant_id in card.votes:
            raise RetroError("Already voted for this card")
        if board.votes_used_by(participant_id) >= board.max_votes_per_person:
            raise RetroError("No votes left")
        card.votes.append(participant_id)
        self.store.save(board)

    def unvote_card(self, board_id: str, participant_id: str, card_id: str) -> None:
        board = self.get_board(board_id)
        card = board.cards.get(card_id)
        if not card:
            raise RetroError("Card not found")
        if participant_id in card.votes:
            card.votes.remove(participant_id)
            self.store.save(board)

    # ---------- Timer ----------

    def start_timer(self, board_id: str, participant_id: str, seconds: int) -> None:
        board = self.get_board(board_id)
        self._require_facilitator(board, participant_id)
        if seconds <= 0:
            raise RetroError("Timer duration must be positive")
        board.timer_running = True
        board.timer_ends_at = datetime.now(timezone.utc) + timedelta(seconds=seconds)
        board.timer_remaining_seconds = None
        self.store.save(board)

    def pause_timer(self, board_id: str, participant_id: str) -> None:
        board = self.get_board(board_id)
        self._require_facilitator(board, participant_id)
        if board.timer_running and board.timer_ends_at:
            remaining = (board.timer_ends_at - datetime.now(timezone.utc)).total_seconds()
            board.timer_remaining_seconds = max(0, round(remaining))
            board.timer_running = False
            board.timer_ends_at = None
            self.store.save(board)

    def resume_timer(self, board_id: str, participant_id: str) -> None:
        board = self.get_board(board_id)
        self._require_facilitator(board, participant_id)
        if not board.timer_running and board.timer_remaining_seconds is not None:
            board.timer_ends_at = datetime.now(timezone.utc) + timedelta(seconds=board.timer_remaining_seconds)
            board.timer_remaining_seconds = None
            board.timer_running = True
            self.store.save(board)

    def reset_timer(self, board_id: str, participant_id: str) -> None:
        board = self.get_board(board_id)
        self._require_facilitator(board, participant_id)
        board.timer_running = False
        board.timer_ends_at = None
        board.timer_remaining_seconds = None
        self.store.save(board)

    # ---------- Helpers ----------

    @staticmethod
    def _require_facilitator(board: RetroBoard, participant_id: str) -> None:
        if board.facilitator_id != participant_id:
            raise RetroError("Only facilitator can perform this action")

    @staticmethod
    def _require_card_owner_or_facilitator(board: RetroBoard, participant_id: str, card: RetroCard) -> None:
        if card.author_id != participant_id and board.facilitator_id != participant_id:
            raise RetroError("Only the card's author or the facilitator can do this")
