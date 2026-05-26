"""Сервисный слой: вся бизнес-логика комнаты.

WebSocket-роутер только парсит сообщения и делегирует сюда. Это упрощает тесты
и позволит легко переиспользовать логику в REST или CLI.
"""
from __future__ import annotations

from collections import Counter
from statistics import mean, median
from typing import Optional

from .models import DECKS, DeckType, Issue, Player, Room
from .store import RoomStore


class RoomError(Exception):
    """Бизнес-ошибка (например: only facilitator can reveal)."""


class RoomService:
    def __init__(self, store: RoomStore) -> None:
        self.store = store

    # ---------- Lifecycle ----------

    def create_room(self, name: str, deck_type: DeckType, facilitator_nickname: str) -> tuple[Room, Player]:
        room = Room(name=name, deck_type=deck_type)
        facilitator = Player(nickname=facilitator_nickname, is_facilitator=True)
        room.facilitator_id = facilitator.id
        room.players[facilitator.id] = facilitator
        self.store.save(room)
        return room, facilitator

    def get_room(self, room_id: str) -> Room:
        room = self.store.get(room_id)
        if not room:
            raise RoomError(f"Room {room_id} not found")
        return room

    # ---------- Players ----------

    def join(self, room_id: str, nickname: str, is_spectator: bool = False) -> Player:
        room = self.get_room(room_id)
        player = Player(nickname=nickname, is_spectator=is_spectator)
        room.players[player.id] = player
        self.store.save(room)
        return player

    def reconnect(self, room_id: str, player_id: str, nickname: str = "") -> Optional[Player]:
        """Игрок вернулся в течение grace-периода — снимаем флаг disconnected."""
        room = self.get_room(room_id)
        player = room.players.get(player_id)
        if not player:
            return None
        player.connected = True
        player.disconnected_at = None
        if nickname:
            player.nickname = nickname
        self.store.save(room)
        return player

    def update_avatar_color(self, room_id: str, player_id: str, color: str) -> None:
        room = self.get_room(room_id)
        player = room.players.get(player_id)
        if not player:
            raise RoomError("Player not found")
        player.avatar_color = color
        self.store.save(room)

    def update_nickname(self, room_id: str, player_id: str, nickname: str) -> None:
        room = self.get_room(room_id)
        player = room.players.get(player_id)
        if not player:
            raise RoomError("Player not found")
        player.nickname = nickname.strip() or player.nickname
        self.store.save(room)

    def update_room(self, room_id: str, player_id: str, name: Optional[str] = None, deck_type: Optional[DeckType] = None, card_back: Optional[str] = None, who_can_reveal: Optional[str] = None, who_can_manage_issues: Optional[str] = None) -> None:
        room = self.get_room(room_id)
        self._require_facilitator(room, player_id)
        if name is not None:
            room.name = name.strip() or room.name
        if deck_type is not None and deck_type != room.deck_type:
            room.deck_type = deck_type
            room.votes.clear()
            room.revealed = False
        if card_back is not None:
            room.card_back = card_back
        if who_can_reveal is not None:
            room.who_can_reveal = who_can_reveal
        if who_can_manage_issues is not None:
            room.who_can_manage_issues = who_can_manage_issues
        self.store.save(room)

    def kick_player(self, room_id: str, player_id: str, target_player_id: str) -> None:
        room = self.get_room(room_id)
        self._require_facilitator(room, player_id)
        if target_player_id == player_id:
            raise RoomError("Cannot kick yourself")
        self.remove_player(room_id, target_player_id)

    def mark_disconnected(self, room_id: str, player_id: str) -> bool:
        """Returns True if the player was in the room and marked disconnected."""
        from datetime import datetime, timezone
        room = self.store.get(room_id)
        if not room or player_id not in room.players:
            return False
        player = room.players[player_id]
        player.connected = False
        player.disconnected_at = datetime.now(timezone.utc)
        self.store.save(room)
        return True

    def remove_player(self, room_id: str, player_id: str) -> None:
        room = self.store.get(room_id)
        if not room:
            return
        room.players.pop(player_id, None)
        room.votes.pop(player_id, None)
        # Если ушёл фасилитатор — передаём роль первому из оставшихся.
        if room.facilitator_id == player_id and room.players:
            new_facilitator = next(iter(room.players.values()))
            new_facilitator.is_facilitator = True
            room.facilitator_id = new_facilitator.id
        # Если в комнате никого — удаляем её.
        if not room.players:
            self.store.delete(room_id)
        else:
            self.store.save(room)

    def toggle_spectator(self, room_id: str, player_id: str) -> None:
        room = self.get_room(room_id)
        player = room.players.get(player_id)
        if not player:
            raise RoomError("Player not in room")
        if player.is_facilitator:
            raise RoomError("Facilitator cannot be a spectator")
        player.is_spectator = not player.is_spectator
        if player.is_spectator:
            room.votes.pop(player_id, None)
        self.store.save(room)

    def close_room(self, room_id: str, player_id: str) -> None:
        room = self.get_room(room_id)
        self._require_facilitator(room, player_id)
        self.store.delete(room_id)

    # ---------- Issues ----------

    def add_issue(self, room_id: str, player_id: str, title: str, description: str = "", link: str = "") -> Issue:
        room = self.get_room(room_id)
        self._require_can_manage_issues(room, player_id)
        issue = Issue(title=title, description=description, link=link)
        room.issues.append(issue)
        # Если активной задачи нет — делаем эту активной автоматически.
        if room.current_issue_id is None:
            room.current_issue_id = issue.id
        self.store.save(room)
        return issue

    def update_issue(self, room_id: str, player_id: str, issue_id: str,
                     title: Optional[str] = None, description: Optional[str] = None,
                     link: Optional[str] = None) -> None:
        room = self.get_room(room_id)
        self._require_can_manage_issues(room, player_id)
        for issue in room.issues:
            if issue.id == issue_id:
                if title is not None:
                    issue.title = title
                if description is not None:
                    issue.description = description
                if link is not None:
                    issue.link = link
                self.store.save(room)
                return
        raise RoomError("Issue not found")

    def delete_issue(self, room_id: str, player_id: str, issue_id: str) -> None:
        room = self.get_room(room_id)
        self._require_can_manage_issues(room, player_id)
        original_len = len(room.issues)
        room.issues = [i for i in room.issues if i.id != issue_id]
        if len(room.issues) == original_len:
            raise RoomError("Issue not found")
        if room.current_issue_id == issue_id:
            room.current_issue_id = room.issues[0].id if room.issues else None
            room.votes.clear()
            room.revealed = False
        self.store.save(room)

    def delete_all_issues(self, room_id: str, player_id: str) -> None:
        room = self.get_room(room_id)
        self._require_can_manage_issues(room, player_id)
        room.issues = []
        room.current_issue_id = None
        room.votes.clear()
        room.revealed = False
        self.store.save(room)

    def reorder_issue(self, room_id: str, player_id: str, issue_id: str, direction: str) -> None:
        room = self.get_room(room_id)
        self._require_can_manage_issues(room, player_id)
        idx = next((i for i, iss in enumerate(room.issues) if iss.id == issue_id), None)
        if idx is None:
            raise RoomError("Issue not found")
        issue = room.issues.pop(idx)
        if direction == "top":
            room.issues.insert(0, issue)
        elif direction == "bottom":
            room.issues.append(issue)
        elif direction == "up":
            room.issues.insert(max(0, idx - 1), issue)
        elif direction == "down":
            room.issues.insert(min(len(room.issues), idx + 1), issue)
        else:
            room.issues.insert(idx, issue)
        self.store.save(room)

    def select_issue(self, room_id: str, player_id: str, issue_id: str) -> None:
        room = self.get_room(room_id)
        self._require_can_manage_issues(room, player_id)
        if not any(i.id == issue_id for i in room.issues):
            raise RoomError("Issue not found")
        room.current_issue_id = issue_id
        room.votes.clear()
        room.revealed = False
        self.store.save(room)

    # ---------- Voting ----------

    def vote(self, room_id: str, player_id: str, card: str) -> None:
        room = self.get_room(room_id)
        player = room.players.get(player_id)
        if not player:
            raise RoomError("Player not in room")
        if player.is_spectator:
            raise RoomError("Spectators cannot vote")
        if room.revealed:
            raise RoomError("Voting closed: results already revealed")
        if card not in room.deck():
            raise RoomError(f"Invalid card '{card}' for this deck")
        room.votes[player_id] = card
        self.store.save(room)

    def revote(self, room_id: str, player_id: str, card: str) -> dict:
        """Re-vote after reveal. Updates stats and issue estimate."""
        room = self.get_room(room_id)
        player = room.players.get(player_id)
        if not player:
            raise RoomError("Player not in room")
        if player.is_spectator:
            raise RoomError("Spectators cannot vote")
        if not room.revealed:
            raise RoomError("Cards not yet revealed")
        if card not in room.deck():
            raise RoomError(f"Invalid card '{card}' for this deck")
        room.votes[player_id] = card
        # Recalculate and auto-update issue estimate from new mode
        if room.current_issue_id and room.votes:
            stats = self.compute_stats(room)
            distribution = stats["distribution"]
            if distribution:
                mode_value = max(distribution, key=lambda k: (distribution[k], k))
                for issue in room.issues:
                    if issue.id == room.current_issue_id:
                        issue.final_estimate = mode_value
                        break
        self.store.save(room)
        return self.compute_stats(room)

    def reveal(self, room_id: str, player_id: str) -> dict:
        room = self.get_room(room_id)
        if room.who_can_reveal == "facilitator":
            self._require_facilitator(room, player_id)
        elif player_id not in room.players:
            raise RoomError("Player not in room")
        room.revealed = True
        # Auto-set final_estimate from mode (most common vote) on current issue
        if room.current_issue_id and room.votes:
            stats = self.compute_stats(room)
            distribution = stats["distribution"]
            if distribution:
                mode_value = max(distribution, key=lambda k: (distribution[k], k))
                for issue in room.issues:
                    if issue.id == room.current_issue_id:
                        issue.final_estimate = mode_value
                        break
        self.store.save(room)
        return self.compute_stats(room)

    def reset_round(self, room_id: str, player_id: str) -> None:
        room = self.get_room(room_id)
        self._require_facilitator(room, player_id)
        room.votes.clear()
        room.revealed = False
        self.store.save(room)

    def set_estimate(self, room_id: str, player_id: str, issue_id: str, estimate: str) -> None:
        room = self.get_room(room_id)
        self._require_facilitator(room, player_id)
        for issue in room.issues:
            if issue.id == issue_id:
                issue.final_estimate = estimate
                self.store.save(room)
                return
        raise RoomError("Issue not found")

    # ---------- Stats ----------

    @staticmethod
    def compute_stats(room: Room) -> dict:
        """Среднее, медиана, распределение, консенсус.

        Числовые карты учитываются в average/median; T-shirt и "?" — только в distribution.
        """
        values = list(room.votes.values())
        distribution = dict(Counter(values))

        numeric: list[float] = []
        for v in values:
            try:
                numeric.append(float(v))
            except ValueError:
                continue

        avg = round(mean(numeric), 2) if numeric else None
        med = median(numeric) if numeric else None
        consensus = len(set(values)) == 1 and len(values) > 0

        return {
            "average": avg,
            "median": med,
            "distribution": distribution,
            "consensus": consensus,
            "total_votes": len(values),
        }

    # ---------- Helpers ----------

    @staticmethod
    def _require_facilitator(room: Room, player_id: str) -> None:
        if room.facilitator_id != player_id:
            raise RoomError("Only facilitator can perform this action")

    @staticmethod
    def _require_can_manage_issues(room: Room, player_id: str) -> None:
        if room.who_can_manage_issues == "facilitator" and room.facilitator_id != player_id:
            raise RoomError("Only facilitator can manage issues")
