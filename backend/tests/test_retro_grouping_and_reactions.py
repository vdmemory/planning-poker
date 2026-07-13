"""Retro board card grouping (drag-to-merge) and card reactions (issue #62, Phase 2)."""
from __future__ import annotations

import pytest

from app.retro_models import RetroTemplate
from app.retro_service import RetroError


def _board(retro_service, template=RetroTemplate.MAD_SAD_GLAD):
    return retro_service.create_board("X", template, "alice")


# ---------- Grouping ----------

def test_group_cards_points_source_at_target(retro_service):
    board, alice = _board(retro_service)
    a = retro_service.add_card(board.id, alice.id, "mad", "one")
    b = retro_service.add_card(board.id, alice.id, "mad", "two")
    retro_service.group_cards(board.id, alice.id, a.id, b.id)
    fresh = retro_service.get_board(board.id)
    assert fresh.cards[a.id].group_id == b.id
    assert fresh.cards[b.id].group_id is None


def test_group_cards_rejects_self_grouping(retro_service):
    board, alice = _board(retro_service)
    a = retro_service.add_card(board.id, alice.id, "mad", "one")
    with pytest.raises(RetroError, match="Cannot group a card with itself"):
        retro_service.group_cards(board.id, alice.id, a.id, a.id)


def test_group_cards_rejects_cross_column(retro_service):
    board, alice = _board(retro_service)
    a = retro_service.add_card(board.id, alice.id, "mad", "one")
    b = retro_service.add_card(board.id, alice.id, "sad", "two")
    with pytest.raises(RetroError, match="different columns"):
        retro_service.group_cards(board.id, alice.id, a.id, b.id)


def test_group_cards_rejects_unknown_card(retro_service):
    board, alice = _board(retro_service)
    a = retro_service.add_card(board.id, alice.id, "mad", "one")
    with pytest.raises(RetroError, match="Card not found"):
        retro_service.group_cards(board.id, alice.id, a.id, "ghost")


def test_group_cards_rejects_already_same_group(retro_service):
    board, alice = _board(retro_service)
    a = retro_service.add_card(board.id, alice.id, "mad", "one")
    b = retro_service.add_card(board.id, alice.id, "mad", "two")
    retro_service.group_cards(board.id, alice.id, a.id, b.id)
    with pytest.raises(RetroError, match="already in the same group"):
        retro_service.group_cards(board.id, alice.id, a.id, b.id)


def test_group_cards_any_participant_can_group(retro_service):
    board, alice = _board(retro_service)
    bob = retro_service.join(board.id, "bob")
    a = retro_service.add_card(board.id, alice.id, "mad", "one")
    b = retro_service.add_card(board.id, alice.id, "mad", "two")
    retro_service.group_cards(board.id, bob.id, a.id, b.id)  # no error — not author-gated
    assert retro_service.get_board(board.id).cards[a.id].group_id == b.id


def test_group_cards_merges_two_existing_stacks(retro_service):
    """Grouping a head that already has children carries the whole stack over."""
    board, alice = _board(retro_service)
    a = retro_service.add_card(board.id, alice.id, "mad", "one")
    b = retro_service.add_card(board.id, alice.id, "mad", "two")
    c = retro_service.add_card(board.id, alice.id, "mad", "three")
    d = retro_service.add_card(board.id, alice.id, "mad", "four")
    retro_service.group_cards(board.id, alice.id, a.id, b.id)  # stack: b <- a
    retro_service.group_cards(board.id, alice.id, c.id, d.id)  # stack: d <- c
    retro_service.group_cards(board.id, alice.id, b.id, d.id)  # merge b's stack into d's
    fresh = retro_service.get_board(board.id)
    assert fresh.cards[b.id].group_id == d.id
    assert fresh.cards[a.id].group_id == d.id  # a followed b's stack over
    assert fresh.cards[c.id].group_id == d.id
    assert fresh.cards[d.id].group_id is None


def test_group_cards_grouping_onto_a_child_resolves_to_its_head(retro_service):
    board, alice = _board(retro_service)
    a = retro_service.add_card(board.id, alice.id, "mad", "one")
    b = retro_service.add_card(board.id, alice.id, "mad", "two")
    c = retro_service.add_card(board.id, alice.id, "mad", "three")
    retro_service.group_cards(board.id, alice.id, a.id, b.id)  # stack: b <- a
    retro_service.group_cards(board.id, alice.id, c.id, a.id)  # a is a child of b — resolves to b
    fresh = retro_service.get_board(board.id)
    assert fresh.cards[c.id].group_id == b.id


def test_ungroup_child_detaches_only_itself(retro_service):
    board, alice = _board(retro_service)
    a = retro_service.add_card(board.id, alice.id, "mad", "one")
    b = retro_service.add_card(board.id, alice.id, "mad", "two")
    c = retro_service.add_card(board.id, alice.id, "mad", "three")
    retro_service.group_cards(board.id, alice.id, a.id, c.id)
    retro_service.group_cards(board.id, alice.id, b.id, c.id)
    retro_service.ungroup_card(board.id, alice.id, a.id)
    fresh = retro_service.get_board(board.id)
    assert fresh.cards[a.id].group_id is None
    assert fresh.cards[b.id].group_id == c.id  # untouched


def test_ungroup_head_dissolves_whole_stack(retro_service):
    board, alice = _board(retro_service)
    a = retro_service.add_card(board.id, alice.id, "mad", "one")
    b = retro_service.add_card(board.id, alice.id, "mad", "two")
    c = retro_service.add_card(board.id, alice.id, "mad", "three")
    retro_service.group_cards(board.id, alice.id, a.id, c.id)
    retro_service.group_cards(board.id, alice.id, b.id, c.id)
    retro_service.ungroup_card(board.id, alice.id, c.id)
    fresh = retro_service.get_board(board.id)
    assert fresh.cards[a.id].group_id is None
    assert fresh.cards[b.id].group_id is None
    assert fresh.cards[c.id].group_id is None


def test_ungroup_standalone_card_raises(retro_service):
    board, alice = _board(retro_service)
    a = retro_service.add_card(board.id, alice.id, "mad", "one")
    with pytest.raises(RetroError, match="not part of a group"):
        retro_service.ungroup_card(board.id, alice.id, a.id)


def test_delete_head_card_promotes_first_child(retro_service):
    board, alice = _board(retro_service)
    a = retro_service.add_card(board.id, alice.id, "mad", "one")
    b = retro_service.add_card(board.id, alice.id, "mad", "two")
    c = retro_service.add_card(board.id, alice.id, "mad", "three")
    retro_service.group_cards(board.id, alice.id, a.id, c.id)
    retro_service.group_cards(board.id, alice.id, b.id, c.id)
    retro_service.delete_card(board.id, alice.id, c.id)
    fresh = retro_service.get_board(board.id)
    assert c.id not in fresh.cards
    # One of a/b became the new head; the other points at it.
    remaining = [fresh.cards[a.id], fresh.cards[b.id]]
    heads = [card for card in remaining if card.group_id is None]
    children = [card for card in remaining if card.group_id is not None]
    assert len(heads) == 1
    assert len(children) == 1
    assert children[0].group_id == heads[0].id


def test_delete_standalone_card_leaves_other_groups_untouched(retro_service):
    board, alice = _board(retro_service)
    a = retro_service.add_card(board.id, alice.id, "mad", "one")
    b = retro_service.add_card(board.id, alice.id, "mad", "two")
    standalone = retro_service.add_card(board.id, alice.id, "mad", "three")
    retro_service.group_cards(board.id, alice.id, a.id, b.id)
    retro_service.delete_card(board.id, alice.id, standalone.id)
    fresh = retro_service.get_board(board.id)
    assert fresh.cards[a.id].group_id == b.id


# ---------- Card reactions ----------

def test_react_to_card_returns_relay_payload(retro_service):
    board, alice = _board(retro_service)
    card = retro_service.add_card(board.id, alice.id, "mad", "text")
    msg = retro_service.react_to_card(board.id, alice.id, card.id, "👍")
    assert msg == {
        "type": "card_reaction",
        "card_id": card.id,
        "from_participant_id": alice.id,
        "from_nickname": "alice",
        "value": "👍",
    }


def test_react_to_card_rejects_unknown_card(retro_service):
    board, alice = _board(retro_service)
    with pytest.raises(RetroError, match="Card not found"):
        retro_service.react_to_card(board.id, alice.id, "ghost", "👍")


def test_react_to_card_rejects_non_participant(retro_service):
    board, alice = _board(retro_service)
    card = retro_service.add_card(board.id, alice.id, "mad", "text")
    with pytest.raises(RetroError, match="Participant not in board"):
        retro_service.react_to_card(board.id, "ghost", card.id, "👍")


def test_react_to_card_rejects_empty_value(retro_service):
    board, alice = _board(retro_service)
    card = retro_service.add_card(board.id, alice.id, "mad", "text")
    with pytest.raises(RetroError, match="Missing reaction value"):
        retro_service.react_to_card(board.id, alice.id, card.id, "")
