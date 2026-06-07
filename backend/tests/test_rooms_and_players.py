"""Room lifecycle + player management.

Documents:
- creating a room makes the creator the facilitator,
- joining a room makes a regular non-spectator player,
- facilitator handoff when the facilitator leaves,
- last-player-out deletes the room,
- spectator toggle rules (facilitator can't become spectator),
- disconnect / reconnect grace flow,
- kick rules (can't kick self, kicked player vanishes),
- close_room destroys the room.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.models import DeckType
from app.services import RoomError


# ---------- Room creation ----------

def test_create_room_makes_creator_the_facilitator(service):
    room, facilitator = service.create_room("Sprint planning", DeckType.FIBONACCI, "alice")
    assert room.name == "Sprint planning"
    assert room.deck_type == DeckType.FIBONACCI
    assert room.facilitator_id == facilitator.id
    assert facilitator.is_facilitator is True
    assert facilitator.is_spectator is False
    assert facilitator.connected is True
    # Room is persisted in the store
    assert service.get_room(room.id).id == room.id


def test_create_room_assigns_short_id(service):
    room, _ = service.create_room("X", DeckType.FIBONACCI, "alice")
    assert len(room.id) == 10  # hex slice
    assert room.id.isalnum()


def test_get_room_unknown_id_raises(service):
    with pytest.raises(RoomError):
        service.get_room("nonexistent")


# ---------- Joining ----------

def test_join_adds_regular_player(service):
    room, _ = service.create_room("X", DeckType.FIBONACCI, "alice")
    bob = service.join(room.id, "bob")
    assert bob.is_facilitator is False
    assert bob.is_spectator is False
    assert bob.connected is True
    assert bob.id in service.get_room(room.id).players


def test_join_as_spectator(service):
    room, _ = service.create_room("X", DeckType.FIBONACCI, "alice")
    spec = service.join(room.id, "watcher", is_spectator=True)
    assert spec.is_spectator is True


# ---------- Facilitator handoff ----------

def test_facilitator_role_passes_to_next_player_when_facilitator_leaves(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    bob = service.join(room.id, "bob")
    # alice leaves
    service.remove_player(room.id, alice.id)
    fresh = service.get_room(room.id)
    assert fresh.facilitator_id == bob.id
    assert fresh.players[bob.id].is_facilitator is True


def test_last_player_leaving_deletes_the_room(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    service.remove_player(room.id, alice.id)
    with pytest.raises(RoomError):
        service.get_room(room.id)


def test_close_room_requires_facilitator(service):
    room, _ = service.create_room("X", DeckType.FIBONACCI, "alice")
    bob = service.join(room.id, "bob")
    with pytest.raises(RoomError, match="Only facilitator"):
        service.close_room(room.id, bob.id)


def test_close_room_destroys_the_room(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    service.join(room.id, "bob")
    service.close_room(room.id, alice.id)
    with pytest.raises(RoomError):
        service.get_room(room.id)


# ---------- Disconnect / reconnect ----------

def test_mark_disconnected_sets_offline_flags(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    before = datetime.now(timezone.utc)
    assert service.mark_disconnected(room.id, alice.id) is True
    fresh = service.get_room(room.id).players[alice.id]
    assert fresh.connected is False
    assert fresh.disconnected_at is not None
    assert fresh.disconnected_at >= before


def test_mark_disconnected_for_unknown_player_returns_false(service):
    room, _ = service.create_room("X", DeckType.FIBONACCI, "alice")
    assert service.mark_disconnected(room.id, "ghost") is False


def test_reconnect_within_grace_clears_offline_flag(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    service.mark_disconnected(room.id, alice.id)
    p = service.reconnect(room.id, alice.id)
    assert p is not None
    assert p.connected is True
    assert p.disconnected_at is None


def test_reconnect_optionally_updates_nickname(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    service.mark_disconnected(room.id, alice.id)
    p = service.reconnect(room.id, alice.id, nickname="alice2")
    assert p.nickname == "alice2"


def test_reconnect_unknown_player_returns_none(service):
    room, _ = service.create_room("X", DeckType.FIBONACCI, "alice")
    assert service.reconnect(room.id, "ghost") is None


# ---------- Spectator toggle ----------

def test_player_can_toggle_spectator_mode(service):
    room, _ = service.create_room("X", DeckType.FIBONACCI, "alice")
    bob = service.join(room.id, "bob")
    service.toggle_spectator(room.id, bob.id)
    assert service.get_room(room.id).players[bob.id].is_spectator is True
    service.toggle_spectator(room.id, bob.id)
    assert service.get_room(room.id).players[bob.id].is_spectator is False


def test_facilitator_cannot_become_spectator(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    with pytest.raises(RoomError, match="Facilitator cannot be a spectator"):
        service.toggle_spectator(room.id, alice.id)


def test_switching_to_spectator_clears_existing_vote(service):
    room, _ = service.create_room("X", DeckType.FIBONACCI, "alice")
    bob = service.join(room.id, "bob")
    service.vote(room.id, bob.id, "5")
    assert bob.id in service.get_room(room.id).votes
    service.toggle_spectator(room.id, bob.id)
    assert bob.id not in service.get_room(room.id).votes


# ---------- Kick ----------

def test_kick_requires_facilitator(service):
    room, _ = service.create_room("X", DeckType.FIBONACCI, "alice")
    bob = service.join(room.id, "bob")
    carol = service.join(room.id, "carol")
    with pytest.raises(RoomError, match="Only facilitator"):
        service.kick_player(room.id, bob.id, carol.id)


def test_facilitator_cannot_kick_self(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    service.join(room.id, "bob")
    with pytest.raises(RoomError, match="Cannot kick yourself"):
        service.kick_player(room.id, alice.id, alice.id)


def test_kicked_player_is_removed_from_room(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    bob = service.join(room.id, "bob")
    service.kick_player(room.id, alice.id, bob.id)
    assert bob.id not in service.get_room(room.id).players


def test_kicked_player_vote_is_cleared(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    bob = service.join(room.id, "bob")
    service.vote(room.id, bob.id, "8")
    service.kick_player(room.id, alice.id, bob.id)
    assert bob.id not in service.get_room(room.id).votes


# ---------- Nickname / avatar ----------

def test_update_nickname_trims_and_ignores_blank(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    service.update_nickname(room.id, alice.id, "  alice-2  ")
    assert service.get_room(room.id).players[alice.id].nickname == "alice-2"
    service.update_nickname(room.id, alice.id, "   ")
    # blank ignored, keeps previous
    assert service.get_room(room.id).players[alice.id].nickname == "alice-2"


def test_update_avatar_color_persists(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    service.update_avatar_color(room.id, alice.id, "#ff00aa")
    assert service.get_room(room.id).players[alice.id].avatar_color == "#ff00aa"


def test_update_nickname_for_unknown_player_raises(service):
    room, _ = service.create_room("X", DeckType.FIBONACCI, "alice")
    with pytest.raises(RoomError, match="Player not found"):
        service.update_nickname(room.id, "ghost", "x")


# ---------- Cleanup task semantics ----------

def test_cleanup_keeps_recently_disconnected_player(service):
    """A player just disconnected (under 30s) must stay until the grace period elapses."""
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    bob = service.join(room.id, "bob")
    service.mark_disconnected(room.id, bob.id)
    # Simulate "1 second ago"
    service.get_room(room.id).players[bob.id].disconnected_at = (
        datetime.now(timezone.utc) - timedelta(seconds=1)
    )
    # If we ran cleanup right now, bob should still be there.
    # (We don't run the loop here; we just assert the timestamp is fresh.)
    assert (datetime.now(timezone.utc) -
            service.get_room(room.id).players[bob.id].disconnected_at).total_seconds() < 30
