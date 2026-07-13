"""Retro board cards, voting, timer, and room-wide settings (issue #62, Phase 1)."""
from __future__ import annotations

import pytest

from app.retro_models import RetroTemplate
from app.retro_service import RetroError


def _board(retro_service, template=RetroTemplate.MAD_SAD_GLAD):
    return retro_service.create_board("X", template, "alice")


# ---------- Cards ----------

def test_add_card_creates_card_in_column(retro_service):
    board, alice = _board(retro_service)
    card = retro_service.add_card(board.id, alice.id, "mad", "Too many meetings")
    assert card.column_id == "mad"
    assert card.author_id == alice.id
    assert card.text == "Too many meetings"
    assert card.votes == []
    assert retro_service.get_board(board.id).cards[card.id].id == card.id


def test_add_card_rejects_unknown_column(retro_service):
    board, alice = _board(retro_service)
    with pytest.raises(RetroError, match="Invalid column"):
        retro_service.add_card(board.id, alice.id, "nonexistent", "text")


def test_add_card_rejects_blank_text(retro_service):
    board, alice = _board(retro_service)
    with pytest.raises(RetroError, match="cannot be empty"):
        retro_service.add_card(board.id, alice.id, "mad", "   ")


def test_add_card_requires_participant_in_board(retro_service):
    board, _ = _board(retro_service)
    with pytest.raises(RetroError, match="Participant not in board"):
        retro_service.add_card(board.id, "ghost", "mad", "text")


def test_edit_card_by_author(retro_service):
    board, alice = _board(retro_service)
    card = retro_service.add_card(board.id, alice.id, "mad", "original")
    retro_service.edit_card(board.id, alice.id, card.id, "edited")
    assert retro_service.get_board(board.id).cards[card.id].text == "edited"


def test_edit_card_by_facilitator_when_not_author(retro_service):
    board, alice = _board(retro_service)
    bob = retro_service.join(board.id, "bob")
    card = retro_service.add_card(board.id, bob.id, "mad", "original")
    retro_service.edit_card(board.id, alice.id, card.id, "moderated")
    assert retro_service.get_board(board.id).cards[card.id].text == "moderated"


def test_edit_card_by_non_author_non_facilitator_raises(retro_service):
    board, alice = _board(retro_service)
    bob = retro_service.join(board.id, "bob")
    carol = retro_service.join(board.id, "carol")
    card = retro_service.add_card(board.id, bob.id, "mad", "original")
    with pytest.raises(RetroError, match="author or the facilitator"):
        retro_service.edit_card(board.id, carol.id, card.id, "hijacked")


def test_delete_card_by_author(retro_service):
    board, alice = _board(retro_service)
    card = retro_service.add_card(board.id, alice.id, "mad", "text")
    retro_service.delete_card(board.id, alice.id, card.id)
    assert card.id not in retro_service.get_board(board.id).cards


def test_delete_card_unknown_raises(retro_service):
    board, alice = _board(retro_service)
    with pytest.raises(RetroError, match="Card not found"):
        retro_service.delete_card(board.id, alice.id, "ghost")


# ---------- Voting ----------

def test_vote_card_adds_participant_to_votes(retro_service):
    board, alice = _board(retro_service)
    card = retro_service.add_card(board.id, alice.id, "mad", "text")
    retro_service.vote_card(board.id, alice.id, card.id)
    assert alice.id in retro_service.get_board(board.id).cards[card.id].votes


def test_vote_card_twice_raises(retro_service):
    board, alice = _board(retro_service)
    card = retro_service.add_card(board.id, alice.id, "mad", "text")
    retro_service.vote_card(board.id, alice.id, card.id)
    with pytest.raises(RetroError, match="Already voted"):
        retro_service.vote_card(board.id, alice.id, card.id)


def test_unvote_card_removes_vote(retro_service):
    board, alice = _board(retro_service)
    card = retro_service.add_card(board.id, alice.id, "mad", "text")
    retro_service.vote_card(board.id, alice.id, card.id)
    retro_service.unvote_card(board.id, alice.id, card.id)
    assert alice.id not in retro_service.get_board(board.id).cards[card.id].votes


def test_unvote_card_when_not_voted_is_a_noop(retro_service):
    board, alice = _board(retro_service)
    card = retro_service.add_card(board.id, alice.id, "mad", "text")
    retro_service.unvote_card(board.id, alice.id, card.id)  # no error
    assert alice.id not in retro_service.get_board(board.id).cards[card.id].votes


def test_vote_budget_enforced_across_all_cards(retro_service):
    board, alice = _board(retro_service)
    retro_service.update_board(board.id, alice.id, max_votes_per_person=2)
    c1 = retro_service.add_card(board.id, alice.id, "mad", "one")
    c2 = retro_service.add_card(board.id, alice.id, "sad", "two")
    c3 = retro_service.add_card(board.id, alice.id, "glad", "three")
    retro_service.vote_card(board.id, alice.id, c1.id)
    retro_service.vote_card(board.id, alice.id, c2.id)
    with pytest.raises(RetroError, match="No votes left"):
        retro_service.vote_card(board.id, alice.id, c3.id)


def test_unvoting_frees_up_budget(retro_service):
    board, alice = _board(retro_service)
    retro_service.update_board(board.id, alice.id, max_votes_per_person=1)
    c1 = retro_service.add_card(board.id, alice.id, "mad", "one")
    c2 = retro_service.add_card(board.id, alice.id, "sad", "two")
    retro_service.vote_card(board.id, alice.id, c1.id)
    retro_service.unvote_card(board.id, alice.id, c1.id)
    retro_service.vote_card(board.id, alice.id, c2.id)  # doesn't raise
    assert alice.id in retro_service.get_board(board.id).cards[c2.id].votes


def test_default_max_votes_per_person_is_five(retro_service):
    board, _ = _board(retro_service)
    assert board.max_votes_per_person == 5


# ---------- update_board settings ----------

def test_update_board_requires_facilitator(retro_service):
    board, _ = _board(retro_service)
    bob = retro_service.join(board.id, "bob")
    with pytest.raises(RetroError, match="Only facilitator"):
        retro_service.update_board(board.id, bob.id, name="Hijacked")


def test_update_board_renames(retro_service):
    board, alice = _board(retro_service)
    retro_service.update_board(board.id, alice.id, name="Renamed retro")
    assert retro_service.get_board(board.id).name == "Renamed retro"


def test_update_board_toggles_anonymous_mode(retro_service):
    board, alice = _board(retro_service)
    assert board.anonymous_mode is False
    retro_service.update_board(board.id, alice.id, anonymous_mode=True)
    assert retro_service.get_board(board.id).anonymous_mode is True


def test_update_board_rejects_non_positive_vote_limit(retro_service):
    board, alice = _board(retro_service)
    with pytest.raises(RetroError, match="at least 1"):
        retro_service.update_board(board.id, alice.id, max_votes_per_person=0)


# ---------- Timer ----------

def test_start_timer_requires_facilitator(retro_service):
    board, _ = _board(retro_service)
    bob = retro_service.join(board.id, "bob")
    with pytest.raises(RetroError, match="Only facilitator"):
        retro_service.start_timer(board.id, bob.id, 300)


def test_start_timer_sets_running_state(retro_service):
    board, alice = _board(retro_service)
    retro_service.start_timer(board.id, alice.id, 300)
    fresh = retro_service.get_board(board.id)
    assert fresh.timer_running is True
    assert fresh.timer_ends_at is not None
    assert fresh.timer_remaining_seconds is None


def test_start_timer_rejects_non_positive_duration(retro_service):
    board, alice = _board(retro_service)
    with pytest.raises(RetroError, match="must be positive"):
        retro_service.start_timer(board.id, alice.id, 0)


def test_pause_timer_snapshots_remaining_time(retro_service):
    board, alice = _board(retro_service)
    retro_service.start_timer(board.id, alice.id, 300)
    retro_service.pause_timer(board.id, alice.id)
    fresh = retro_service.get_board(board.id)
    assert fresh.timer_running is False
    assert fresh.timer_ends_at is None
    assert fresh.timer_remaining_seconds is not None
    assert 0 < fresh.timer_remaining_seconds <= 300


def test_resume_timer_restarts_from_snapshot(retro_service):
    board, alice = _board(retro_service)
    retro_service.start_timer(board.id, alice.id, 300)
    retro_service.pause_timer(board.id, alice.id)
    retro_service.resume_timer(board.id, alice.id)
    fresh = retro_service.get_board(board.id)
    assert fresh.timer_running is True
    assert fresh.timer_ends_at is not None
    assert fresh.timer_remaining_seconds is None


def test_reset_timer_clears_all_timer_state(retro_service):
    board, alice = _board(retro_service)
    retro_service.start_timer(board.id, alice.id, 300)
    retro_service.reset_timer(board.id, alice.id)
    fresh = retro_service.get_board(board.id)
    assert fresh.timer_running is False
    assert fresh.timer_ends_at is None
    assert fresh.timer_remaining_seconds is None


def test_timer_actions_require_facilitator(retro_service):
    board, _ = _board(retro_service)
    bob = retro_service.join(board.id, "bob")
    with pytest.raises(RetroError, match="Only facilitator"):
        retro_service.pause_timer(board.id, bob.id)
    with pytest.raises(RetroError, match="Only facilitator"):
        retro_service.resume_timer(board.id, bob.id)
    with pytest.raises(RetroError, match="Only facilitator"):
        retro_service.reset_timer(board.id, bob.id)
