"""Retro board card comments (issue #65)."""
from __future__ import annotations

import pytest

from app.retro_models import RetroTemplate
from app.retro_service import RetroError


def _board(retro_service, template=RetroTemplate.MAD_SAD_GLAD):
    return retro_service.create_board("X", template, "alice")


def test_add_comment_appends_to_card(retro_service):
    board, alice = _board(retro_service)
    card = retro_service.add_card(board.id, alice.id, "mad", "text")
    comment = retro_service.add_comment(board.id, alice.id, card.id, "good point")
    assert comment.author_id == alice.id
    assert comment.text == "good point"
    fresh = retro_service.get_board(board.id).cards[card.id]
    assert len(fresh.comments) == 1
    assert fresh.comments[0].id == comment.id


def test_add_comment_any_participant_can_comment(retro_service):
    board, alice = _board(retro_service)
    bob = retro_service.join(board.id, "bob")
    card = retro_service.add_card(board.id, alice.id, "mad", "text")
    retro_service.add_comment(board.id, bob.id, card.id, "from bob")  # no error — not author-gated
    assert retro_service.get_board(board.id).cards[card.id].comments[0].author_id == bob.id


def test_add_comment_rejects_unknown_card(retro_service):
    board, alice = _board(retro_service)
    with pytest.raises(RetroError, match="Card not found"):
        retro_service.add_comment(board.id, alice.id, "ghost", "text")


def test_add_comment_rejects_non_participant(retro_service):
    board, alice = _board(retro_service)
    card = retro_service.add_card(board.id, alice.id, "mad", "text")
    with pytest.raises(RetroError, match="Participant not in board"):
        retro_service.add_comment(board.id, "ghost", card.id, "text")


def test_add_comment_rejects_blank_text(retro_service):
    board, alice = _board(retro_service)
    card = retro_service.add_card(board.id, alice.id, "mad", "text")
    with pytest.raises(RetroError, match="cannot be empty"):
        retro_service.add_comment(board.id, alice.id, card.id, "   ")


def test_delete_comment_by_author(retro_service):
    board, alice = _board(retro_service)
    card = retro_service.add_card(board.id, alice.id, "mad", "text")
    comment = retro_service.add_comment(board.id, alice.id, card.id, "text")
    retro_service.delete_comment(board.id, alice.id, card.id, comment.id)
    assert retro_service.get_board(board.id).cards[card.id].comments == []


def test_delete_comment_by_facilitator_when_not_author(retro_service):
    board, alice = _board(retro_service)
    bob = retro_service.join(board.id, "bob")
    card = retro_service.add_card(board.id, alice.id, "mad", "text")
    comment = retro_service.add_comment(board.id, bob.id, card.id, "text")
    retro_service.delete_comment(board.id, alice.id, card.id, comment.id)  # alice is facilitator
    assert retro_service.get_board(board.id).cards[card.id].comments == []


def test_delete_comment_by_non_author_non_facilitator_raises(retro_service):
    board, alice = _board(retro_service)
    bob = retro_service.join(board.id, "bob")
    carol = retro_service.join(board.id, "carol")
    card = retro_service.add_card(board.id, alice.id, "mad", "text")
    comment = retro_service.add_comment(board.id, bob.id, card.id, "text")
    with pytest.raises(RetroError, match="author or the facilitator"):
        retro_service.delete_comment(board.id, carol.id, card.id, comment.id)


def test_delete_comment_rejects_unknown_card(retro_service):
    board, alice = _board(retro_service)
    with pytest.raises(RetroError, match="Card not found"):
        retro_service.delete_comment(board.id, alice.id, "ghost", "some-id")


def test_delete_comment_rejects_unknown_comment(retro_service):
    board, alice = _board(retro_service)
    card = retro_service.add_card(board.id, alice.id, "mad", "text")
    with pytest.raises(RetroError, match="Comment not found"):
        retro_service.delete_comment(board.id, alice.id, card.id, "ghost")
