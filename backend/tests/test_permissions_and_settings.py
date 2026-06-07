"""Permission gates and room settings.

Documents:
- always-facilitator actions: update_room, kick, close_room,
- who_can_reveal gate on reveal/reset_round (facilitator | everyone),
- who_can_manage_issues gate on add/update/delete/reorder/select/set_estimate,
- update_room respects partial updates and strips blank names.
"""
from __future__ import annotations

import pytest

from app.models import DeckType
from app.services import RoomError


# ---------- who_can_reveal ----------

def test_reveal_defaults_to_facilitator_only(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    bob = service.join(room.id, "bob")
    assert service.get_room(room.id).who_can_reveal == "facilitator"
    with pytest.raises(RoomError, match="Only facilitator"):
        service.reveal(room.id, bob.id)


def test_reveal_by_anyone_when_who_can_reveal_is_everyone(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    bob = service.join(room.id, "bob")
    service.update_room(room.id, alice.id, who_can_reveal="everyone")
    service.vote(room.id, alice.id, "5")
    # Bob (non-facilitator) can now reveal
    stats = service.reveal(room.id, bob.id)
    assert stats["total_votes"] == 1


def test_reveal_by_non_member_rejected_even_in_everyone_mode(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    service.update_room(room.id, alice.id, who_can_reveal="everyone")
    with pytest.raises(RoomError, match="Player not in room"):
        service.reveal(room.id, "ghost")


def test_reset_round_uses_same_gate_as_reveal(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    bob = service.join(room.id, "bob")
    # Default: only facilitator
    with pytest.raises(RoomError, match="Only facilitator"):
        service.reset_round(room.id, bob.id)
    # Open it up
    service.update_room(room.id, alice.id, who_can_reveal="everyone")
    service.reset_round(room.id, bob.id)  # now allowed


# ---------- who_can_manage_issues ----------

def test_issue_actions_default_to_facilitator_only(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    bob = service.join(room.id, "bob")
    assert service.get_room(room.id).who_can_manage_issues == "facilitator"
    with pytest.raises(RoomError, match="Only facilitator"):
        service.add_issue(room.id, bob.id, "T-1")


def test_issue_actions_open_when_everyone_allowed(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    bob = service.join(room.id, "bob")
    service.update_room(room.id, alice.id, who_can_manage_issues="everyone")
    issue = service.add_issue(room.id, bob.id, "T-1")
    service.update_issue(room.id, bob.id, issue.id, title="T-1-edited")
    service.set_estimate(room.id, bob.id, issue.id, "5")
    service.delete_issue(room.id, bob.id, issue.id)


def test_set_estimate_respects_who_can_manage_issues(service):
    """Regression-style: set_estimate is gated like the rest of issue actions."""
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    bob = service.join(room.id, "bob")
    issue = service.add_issue(room.id, alice.id, "T-1")
    with pytest.raises(RoomError, match="Only facilitator"):
        service.set_estimate(room.id, bob.id, issue.id, "5")


# ---------- update_room is facilitator-only ----------

def test_update_room_requires_facilitator(service):
    room, _ = service.create_room("X", DeckType.FIBONACCI, "alice")
    bob = service.join(room.id, "bob")
    with pytest.raises(RoomError, match="Only facilitator"):
        service.update_room(room.id, bob.id, who_can_reveal="everyone")


def test_update_room_supports_partial_changes(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    service.update_room(room.id, alice.id, card_back="red_pattern")
    fresh = service.get_room(room.id)
    assert fresh.card_back == "red_pattern"
    assert fresh.deck_type == DeckType.FIBONACCI  # untouched
    assert fresh.who_can_reveal == "facilitator"  # untouched


def test_update_room_ignores_blank_name(service):
    room, alice = service.create_room("Original", DeckType.FIBONACCI, "alice")
    service.update_room(room.id, alice.id, name="   ")
    assert service.get_room(room.id).name == "Original"


def test_update_room_trims_name(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    service.update_room(room.id, alice.id, name="  Renamed  ")
    assert service.get_room(room.id).name == "Renamed"


# ---------- kick is facilitator-only (covered also in players file, here for spec completeness) ----------

def test_kick_player_is_facilitator_only(service):
    room, _ = service.create_room("X", DeckType.FIBONACCI, "alice")
    bob = service.join(room.id, "bob")
    carol = service.join(room.id, "carol")
    with pytest.raises(RoomError, match="Only facilitator"):
        service.kick_player(room.id, bob.id, carol.id)
