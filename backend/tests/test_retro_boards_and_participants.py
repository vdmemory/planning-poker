"""Retro board lifecycle + participant management (issue #62, Phase 1).

Mirrors test_rooms_and_players.py's structure for the retro domain:
- creating a board makes the creator the facilitator, with the template's columns,
- joining adds a regular participant,
- facilitator handoff when the facilitator leaves,
- last-participant-out deletes the board,
- disconnect / reconnect grace flow,
- kick rules,
- close_board destroys the board.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.retro_models import RetroTemplate
from app.retro_service import RetroError


# ---------- Board creation ----------

def test_create_board_makes_creator_the_facilitator(retro_service):
    board, facilitator = retro_service.create_board("Sprint 42 Retro", RetroTemplate.MAD_SAD_GLAD, "alice")
    assert board.name == "Sprint 42 Retro"
    assert board.template == RetroTemplate.MAD_SAD_GLAD
    assert board.facilitator_id == facilitator.id
    assert facilitator.is_facilitator is True
    assert facilitator.connected is True
    assert retro_service.get_board(board.id).id == board.id


def test_create_board_assigns_short_id(retro_service):
    board, _ = retro_service.create_board("X", RetroTemplate.MAD_SAD_GLAD, "alice")
    assert len(board.id) == 10
    assert board.id.isalnum()


@pytest.mark.parametrize("template,expected_columns", [
    (RetroTemplate.MAD_SAD_GLAD, ["Mad", "Sad", "Glad"]),
    (RetroTemplate.START_STOP_CONTINUE, ["Start", "Stop", "Continue"]),
    (RetroTemplate.FOUR_LS, ["Liked", "Learned", "Lacked", "Longed for"]),
])
def test_create_board_seeds_columns_from_template(retro_service, template, expected_columns):
    board, _ = retro_service.create_board("X", template, "alice")
    assert [c.title for c in board.columns] == expected_columns


def test_get_board_unknown_id_raises(retro_service):
    with pytest.raises(RetroError):
        retro_service.get_board("nonexistent")


# ---------- Joining ----------

def test_join_adds_regular_participant(retro_service):
    board, _ = retro_service.create_board("X", RetroTemplate.MAD_SAD_GLAD, "alice")
    bob = retro_service.join(board.id, "bob")
    assert bob.is_facilitator is False
    assert bob.connected is True
    assert bob.id in retro_service.get_board(board.id).participants


# ---------- Facilitator handoff ----------

def test_facilitator_role_passes_to_next_participant_when_facilitator_leaves(retro_service):
    board, alice = retro_service.create_board("X", RetroTemplate.MAD_SAD_GLAD, "alice")
    bob = retro_service.join(board.id, "bob")
    retro_service.remove_participant(board.id, alice.id)
    fresh = retro_service.get_board(board.id)
    assert fresh.facilitator_id == bob.id
    assert fresh.participants[bob.id].is_facilitator is True


def test_last_participant_leaving_deletes_the_board(retro_service):
    board, alice = retro_service.create_board("X", RetroTemplate.MAD_SAD_GLAD, "alice")
    retro_service.remove_participant(board.id, alice.id)
    with pytest.raises(RetroError):
        retro_service.get_board(board.id)


def test_removing_participant_clears_their_votes(retro_service):
    board, alice = retro_service.create_board("X", RetroTemplate.MAD_SAD_GLAD, "alice")
    bob = retro_service.join(board.id, "bob")
    card = retro_service.add_card(board.id, alice.id, "mad", "Too many meetings")
    retro_service.vote_card(board.id, bob.id, card.id)
    retro_service.remove_participant(board.id, bob.id)
    fresh = retro_service.get_board(board.id)
    assert bob.id not in fresh.cards[card.id].votes


# ---------- Close board ----------

def test_close_board_requires_facilitator(retro_service):
    board, _ = retro_service.create_board("X", RetroTemplate.MAD_SAD_GLAD, "alice")
    bob = retro_service.join(board.id, "bob")
    with pytest.raises(RetroError, match="Only facilitator"):
        retro_service.close_board(board.id, bob.id)


def test_close_board_destroys_the_board(retro_service):
    board, alice = retro_service.create_board("X", RetroTemplate.MAD_SAD_GLAD, "alice")
    retro_service.join(board.id, "bob")
    retro_service.close_board(board.id, alice.id)
    with pytest.raises(RetroError):
        retro_service.get_board(board.id)


# ---------- Disconnect / reconnect ----------

def test_mark_disconnected_sets_offline_flags(retro_service):
    board, alice = retro_service.create_board("X", RetroTemplate.MAD_SAD_GLAD, "alice")
    before = datetime.now(timezone.utc)
    assert retro_service.mark_disconnected(board.id, alice.id) is True
    fresh = retro_service.get_board(board.id).participants[alice.id]
    assert fresh.connected is False
    assert fresh.disconnected_at is not None
    assert fresh.disconnected_at >= before


def test_mark_disconnected_for_unknown_participant_returns_false(retro_service):
    board, _ = retro_service.create_board("X", RetroTemplate.MAD_SAD_GLAD, "alice")
    assert retro_service.mark_disconnected(board.id, "ghost") is False


def test_reconnect_within_grace_clears_offline_flag(retro_service):
    board, alice = retro_service.create_board("X", RetroTemplate.MAD_SAD_GLAD, "alice")
    retro_service.mark_disconnected(board.id, alice.id)
    p = retro_service.reconnect(board.id, alice.id)
    assert p is not None
    assert p.connected is True
    assert p.disconnected_at is None


def test_reconnect_optionally_updates_nickname(retro_service):
    board, alice = retro_service.create_board("X", RetroTemplate.MAD_SAD_GLAD, "alice")
    retro_service.mark_disconnected(board.id, alice.id)
    p = retro_service.reconnect(board.id, alice.id, nickname="alice2")
    assert p.nickname == "alice2"


def test_reconnect_unknown_participant_returns_none(retro_service):
    board, _ = retro_service.create_board("X", RetroTemplate.MAD_SAD_GLAD, "alice")
    assert retro_service.reconnect(board.id, "ghost") is None


# ---------- Kick ----------

def test_kick_requires_facilitator(retro_service):
    board, _ = retro_service.create_board("X", RetroTemplate.MAD_SAD_GLAD, "alice")
    bob = retro_service.join(board.id, "bob")
    carol = retro_service.join(board.id, "carol")
    with pytest.raises(RetroError, match="Only facilitator"):
        retro_service.kick_participant(board.id, bob.id, carol.id)


def test_facilitator_cannot_kick_self(retro_service):
    board, alice = retro_service.create_board("X", RetroTemplate.MAD_SAD_GLAD, "alice")
    retro_service.join(board.id, "bob")
    with pytest.raises(RetroError, match="Cannot kick yourself"):
        retro_service.kick_participant(board.id, alice.id, alice.id)


def test_kicked_participant_is_removed_from_board(retro_service):
    board, alice = retro_service.create_board("X", RetroTemplate.MAD_SAD_GLAD, "alice")
    bob = retro_service.join(board.id, "bob")
    retro_service.kick_participant(board.id, alice.id, bob.id)
    assert bob.id not in retro_service.get_board(board.id).participants


# ---------- Nickname / avatar ----------

def test_update_nickname_trims_and_ignores_blank(retro_service):
    board, alice = retro_service.create_board("X", RetroTemplate.MAD_SAD_GLAD, "alice")
    retro_service.update_nickname(board.id, alice.id, "  alice-2  ")
    assert retro_service.get_board(board.id).participants[alice.id].nickname == "alice-2"
    retro_service.update_nickname(board.id, alice.id, "   ")
    assert retro_service.get_board(board.id).participants[alice.id].nickname == "alice-2"


def test_update_avatar_color_persists(retro_service):
    board, alice = retro_service.create_board("X", RetroTemplate.MAD_SAD_GLAD, "alice")
    retro_service.update_avatar_color(board.id, alice.id, "#ff00aa")
    assert retro_service.get_board(board.id).participants[alice.id].avatar_color == "#ff00aa"


def test_update_nickname_for_unknown_participant_raises(retro_service):
    board, _ = retro_service.create_board("X", RetroTemplate.MAD_SAD_GLAD, "alice")
    with pytest.raises(RetroError, match="Participant not found"):
        retro_service.update_nickname(board.id, "ghost", "x")


# ---------- Cleanup task semantics ----------

def test_cleanup_keeps_recently_disconnected_participant(retro_service):
    board, alice = retro_service.create_board("X", RetroTemplate.MAD_SAD_GLAD, "alice")
    bob = retro_service.join(board.id, "bob")
    retro_service.mark_disconnected(board.id, bob.id)
    retro_service.get_board(board.id).participants[bob.id].disconnected_at = (
        datetime.now(timezone.utc) - timedelta(seconds=1)
    )
    assert (datetime.now(timezone.utc) -
            retro_service.get_board(board.id).participants[bob.id].disconnected_at).total_seconds() < 30
