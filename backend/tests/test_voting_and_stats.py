"""Voting lifecycle: vote → reveal → reset, revote, hidden state, stats math.

Documents:
- votes are hidden until reveal,
- spectators cannot vote,
- you cannot vote after reveal (only revote),
- card must belong to the room's deck,
- reveal computes stats and auto-sets the issue's final_estimate to the mode,
- revote recomputes both,
- reset clears votes but keeps final_estimate.
"""
from __future__ import annotations

import pytest

from app.models import DeckType
from app.services import RoomError, RoomService


# ---------- Hidden until reveal ----------

def test_public_state_hides_card_values_until_reveal(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    bob = service.join(room.id, "bob")
    service.vote(room.id, alice.id, "5")
    service.vote(room.id, bob.id, "8")
    state = service.get_room(room.id).public_state()
    assert state["revealed"] is False
    assert set(state["votes"].values()) == {"hidden"}
    # But the fact of voting is visible
    assert sorted(state["voted_player_ids"]) == sorted([alice.id, bob.id])


def test_public_state_exposes_values_after_reveal(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    bob = service.join(room.id, "bob")
    service.vote(room.id, alice.id, "5")
    service.vote(room.id, bob.id, "8")
    service.reveal(room.id, alice.id)
    state = service.get_room(room.id).public_state()
    assert state["revealed"] is True
    assert state["votes"][alice.id] == "5"
    assert state["votes"][bob.id] == "8"


# ---------- Vote validation ----------

def test_spectator_cannot_vote(service):
    room, _ = service.create_room("X", DeckType.FIBONACCI, "alice")
    spec = service.join(room.id, "watcher", is_spectator=True)
    with pytest.raises(RoomError, match="Spectators cannot vote"):
        service.vote(room.id, spec.id, "5")


def test_vote_must_belong_to_deck(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    with pytest.raises(RoomError, match="Invalid card"):
        service.vote(room.id, alice.id, "100")  # not in fibonacci deck


def test_vote_uses_room_deck_not_other_decks(service):
    room, alice = service.create_room("X", DeckType.TSHIRT, "alice")
    # 5 is a valid fibonacci card but not tshirt
    with pytest.raises(RoomError, match="Invalid card"):
        service.vote(room.id, alice.id, "5")
    # XL is fine for tshirt
    service.vote(room.id, alice.id, "XL")


def test_vote_can_be_overwritten_before_reveal(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    service.vote(room.id, alice.id, "3")
    service.vote(room.id, alice.id, "8")
    assert service.get_room(room.id).votes[alice.id] == "8"


def test_vote_after_reveal_is_rejected(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    service.vote(room.id, alice.id, "5")
    service.reveal(room.id, alice.id)
    with pytest.raises(RoomError, match="Voting closed"):
        service.vote(room.id, alice.id, "8")


def test_vote_by_non_member_raises(service):
    room, _ = service.create_room("X", DeckType.FIBONACCI, "alice")
    with pytest.raises(RoomError, match="Player not in room"):
        service.vote(room.id, "ghost", "5")


# ---------- Reveal / reset ----------

def test_reveal_returns_stats(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    bob = service.join(room.id, "bob")
    service.vote(room.id, alice.id, "5")
    service.vote(room.id, bob.id, "8")
    stats = service.reveal(room.id, alice.id)
    assert stats["total_votes"] == 2
    assert stats["average"] == 6.5
    assert stats["median"] == 6.5
    assert stats["distribution"] == {"5": 1, "8": 1}
    assert stats["consensus"] is False


def test_reset_clears_votes_and_unreveals(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    service.vote(room.id, alice.id, "5")
    service.reveal(room.id, alice.id)
    service.reset_round(room.id, alice.id)
    fresh = service.get_room(room.id)
    assert fresh.votes == {}
    assert fresh.revealed is False


def test_reset_keeps_final_estimate_on_issue(service):
    """A reset opens a new round but doesn't blow away the estimate previously decided."""
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    issue = service.add_issue(room.id, alice.id, "T-1")
    service.vote(room.id, alice.id, "5")
    service.reveal(room.id, alice.id)
    assert service.get_room(room.id).issues[0].final_estimate == "5"
    service.reset_round(room.id, alice.id)
    # final_estimate survives the reset
    assert service.get_room(room.id).issues[0].final_estimate == "5"


# ---------- Revote ----------

def test_revote_only_after_reveal(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    service.vote(room.id, alice.id, "5")
    with pytest.raises(RoomError, match="not yet revealed"):
        service.revote(room.id, alice.id, "8")


def test_revote_updates_value_and_stats(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    bob = service.join(room.id, "bob")
    service.vote(room.id, alice.id, "5")
    service.vote(room.id, bob.id, "5")
    service.reveal(room.id, alice.id)
    new_stats = service.revote(room.id, alice.id, "13")
    assert service.get_room(room.id).votes[alice.id] == "13"
    assert new_stats["average"] == round((13 + 5) / 2, 2)


def test_revote_recomputes_issue_estimate_from_new_mode(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    bob = service.join(room.id, "bob")
    carol = service.join(room.id, "carol")
    service.add_issue(room.id, alice.id, "T-1")
    service.vote(room.id, alice.id, "5")
    service.vote(room.id, bob.id, "5")
    service.vote(room.id, carol.id, "8")
    service.reveal(room.id, alice.id)
    assert service.get_room(room.id).issues[0].final_estimate == "5"
    # Carol flips to 8, alice flips to 8: new mode is 8
    service.revote(room.id, carol.id, "8")
    service.revote(room.id, alice.id, "8")
    assert service.get_room(room.id).issues[0].final_estimate == "8"


# ---------- Stats math ----------

def test_stats_consensus_when_all_same(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    bob = service.join(room.id, "bob")
    service.vote(room.id, alice.id, "5")
    service.vote(room.id, bob.id, "5")
    stats = service.reveal(room.id, alice.id)
    assert stats["consensus"] is True


def test_stats_no_consensus_with_no_votes(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    stats = service.reveal(room.id, alice.id)
    assert stats["consensus"] is False
    assert stats["total_votes"] == 0
    assert stats["average"] is None
    assert stats["median"] is None


def test_stats_excludes_non_numeric_from_average_and_median(service):
    """`?`, `☕`, T-shirt cards still appear in distribution but not in numeric stats."""
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    bob = service.join(room.id, "bob")
    carol = service.join(room.id, "carol")
    service.vote(room.id, alice.id, "5")
    service.vote(room.id, bob.id, "?")
    service.vote(room.id, carol.id, "☕")
    stats = service.reveal(room.id, alice.id)
    assert stats["average"] == 5.0
    assert stats["median"] == 5.0
    assert stats["distribution"] == {"5": 1, "?": 1, "☕": 1}
    assert stats["total_votes"] == 3


def test_tshirt_distribution_has_no_numeric_stats(service):
    room, alice = service.create_room("X", DeckType.TSHIRT, "alice")
    bob = service.join(room.id, "bob")
    service.vote(room.id, alice.id, "M")
    service.vote(room.id, bob.id, "L")
    stats = service.reveal(room.id, alice.id)
    assert stats["average"] is None
    assert stats["median"] is None
    assert stats["distribution"] == {"M": 1, "L": 1}


def test_mode_breaks_ties_lexicographically(service):
    """When two cards tie for the mode, the lexicographically larger one wins (matches code)."""
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    bob = service.join(room.id, "bob")
    service.add_issue(room.id, alice.id, "T-1")
    service.vote(room.id, alice.id, "3")
    service.vote(room.id, bob.id, "8")
    service.reveal(room.id, alice.id)
    # "8" > "3" lexicographically
    assert service.get_room(room.id).issues[0].final_estimate == "8"


# ---------- Changing the deck mid-round ----------

def test_changing_deck_clears_votes_and_unreveals(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    bob = service.join(room.id, "bob")
    service.vote(room.id, alice.id, "5")
    service.vote(room.id, bob.id, "8")
    service.reveal(room.id, alice.id)
    service.update_room(room.id, alice.id, deck_type=DeckType.TSHIRT)
    fresh = service.get_room(room.id)
    assert fresh.votes == {}
    assert fresh.revealed is False
    assert fresh.deck_type == DeckType.TSHIRT
