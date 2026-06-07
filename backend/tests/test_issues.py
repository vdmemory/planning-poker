"""Issue queue: add, update, delete, reorder, select, estimate.

Documents:
- adding the first issue auto-selects it as the current one,
- selecting an issue starts a fresh round (votes cleared, not revealed),
- deleting the active issue advances to the next, clearing votes,
- delete_all wipes the queue and the round,
- reorder supports top/up/down/bottom,
- set_estimate is an override (separate from the auto-mode set at reveal).
"""
from __future__ import annotations

import pytest

from app.models import DeckType
from app.services import RoomError


# ---------- Add / first becomes active ----------

def test_add_first_issue_auto_selects_it_as_current(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    issue = service.add_issue(room.id, alice.id, "T-1")
    fresh = service.get_room(room.id)
    assert fresh.current_issue_id == issue.id
    assert fresh.issues[0].title == "T-1"


def test_subsequent_issues_do_not_change_current(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    first = service.add_issue(room.id, alice.id, "T-1")
    service.add_issue(room.id, alice.id, "T-2")
    assert service.get_room(room.id).current_issue_id == first.id


def test_issue_can_have_description_and_link(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    issue = service.add_issue(
        room.id, alice.id, "T-1",
        description="Migrate auth",
        link="https://example.com/T-1",
    )
    assert issue.description == "Migrate auth"
    assert issue.link == "https://example.com/T-1"


# ---------- Update ----------

def test_update_issue_changes_provided_fields_only(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    issue = service.add_issue(room.id, alice.id, "T-1", description="orig")
    service.update_issue(room.id, alice.id, issue.id, title="T-1-renamed")
    fresh = service.get_room(room.id).issues[0]
    assert fresh.title == "T-1-renamed"
    assert fresh.description == "orig"  # unchanged


def test_update_unknown_issue_raises(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    with pytest.raises(RoomError, match="Issue not found"):
        service.update_issue(room.id, alice.id, "ghost", title="x")


# ---------- Select ----------

def test_selecting_an_issue_starts_a_fresh_round(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    issue1 = service.add_issue(room.id, alice.id, "T-1")
    issue2 = service.add_issue(room.id, alice.id, "T-2")
    service.vote(room.id, alice.id, "5")
    service.reveal(room.id, alice.id)
    service.select_issue(room.id, alice.id, issue2.id)
    fresh = service.get_room(room.id)
    assert fresh.current_issue_id == issue2.id
    assert fresh.votes == {}
    assert fresh.revealed is False


def test_selecting_unknown_issue_raises(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    service.add_issue(room.id, alice.id, "T-1")
    with pytest.raises(RoomError, match="Issue not found"):
        service.select_issue(room.id, alice.id, "ghost")


# ---------- Delete ----------

def test_deleting_active_issue_advances_to_first_remaining(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    issue1 = service.add_issue(room.id, alice.id, "T-1")
    issue2 = service.add_issue(room.id, alice.id, "T-2")
    service.vote(room.id, alice.id, "5")
    service.delete_issue(room.id, alice.id, issue1.id)
    fresh = service.get_room(room.id)
    assert fresh.current_issue_id == issue2.id
    assert fresh.votes == {}
    assert fresh.revealed is False


def test_deleting_active_issue_when_no_others_leaves_none(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    issue = service.add_issue(room.id, alice.id, "T-1")
    service.delete_issue(room.id, alice.id, issue.id)
    fresh = service.get_room(room.id)
    assert fresh.current_issue_id is None
    assert fresh.issues == []


def test_deleting_non_active_issue_keeps_current_round(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    active = service.add_issue(room.id, alice.id, "T-1")
    other = service.add_issue(room.id, alice.id, "T-2")
    service.vote(room.id, alice.id, "5")
    service.delete_issue(room.id, alice.id, other.id)
    fresh = service.get_room(room.id)
    assert fresh.current_issue_id == active.id
    assert alice.id in fresh.votes  # vote preserved


def test_delete_unknown_issue_raises(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    with pytest.raises(RoomError, match="Issue not found"):
        service.delete_issue(room.id, alice.id, "ghost")


def test_delete_all_issues_wipes_queue_and_round(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    service.add_issue(room.id, alice.id, "T-1")
    service.add_issue(room.id, alice.id, "T-2")
    service.vote(room.id, alice.id, "5")
    service.reveal(room.id, alice.id)
    service.delete_all_issues(room.id, alice.id)
    fresh = service.get_room(room.id)
    assert fresh.issues == []
    assert fresh.current_issue_id is None
    assert fresh.votes == {}
    assert fresh.revealed is False


# ---------- Reorder ----------

@pytest.fixture
def room_with_three_issues(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    i1 = service.add_issue(room.id, alice.id, "T-1")
    i2 = service.add_issue(room.id, alice.id, "T-2")
    i3 = service.add_issue(room.id, alice.id, "T-3")
    return service, room, alice, [i1, i2, i3]


def _ids(room):
    return [i.id for i in room.issues]


def test_reorder_top_moves_to_front(room_with_three_issues):
    service, room, alice, (i1, i2, i3) = room_with_three_issues
    service.reorder_issue(room.id, alice.id, i3.id, "top")
    assert _ids(service.get_room(room.id)) == [i3.id, i1.id, i2.id]


def test_reorder_bottom_moves_to_back(room_with_three_issues):
    service, room, alice, (i1, i2, i3) = room_with_three_issues
    service.reorder_issue(room.id, alice.id, i1.id, "bottom")
    assert _ids(service.get_room(room.id)) == [i2.id, i3.id, i1.id]


def test_reorder_up_swaps_with_previous(room_with_three_issues):
    service, room, alice, (i1, i2, i3) = room_with_three_issues
    service.reorder_issue(room.id, alice.id, i2.id, "up")
    assert _ids(service.get_room(room.id)) == [i2.id, i1.id, i3.id]


def test_reorder_down_swaps_with_next(room_with_three_issues):
    service, room, alice, (i1, i2, i3) = room_with_three_issues
    service.reorder_issue(room.id, alice.id, i2.id, "down")
    assert _ids(service.get_room(room.id)) == [i1.id, i3.id, i2.id]


def test_reorder_unknown_issue_raises(room_with_three_issues):
    service, room, alice, _ = room_with_three_issues
    with pytest.raises(RoomError, match="Issue not found"):
        service.reorder_issue(room.id, alice.id, "ghost", "top")


# ---------- set_estimate ----------

def test_set_estimate_overrides_final_estimate(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    issue = service.add_issue(room.id, alice.id, "T-1")
    service.vote(room.id, alice.id, "5")
    service.reveal(room.id, alice.id)
    assert service.get_room(room.id).issues[0].final_estimate == "5"
    # Facilitator overrides after discussion
    service.set_estimate(room.id, alice.id, issue.id, "8")
    assert service.get_room(room.id).issues[0].final_estimate == "8"


def test_set_estimate_unknown_issue_raises(service):
    room, alice = service.create_room("X", DeckType.FIBONACCI, "alice")
    with pytest.raises(RoomError, match="Issue not found"):
        service.set_estimate(room.id, alice.id, "ghost", "5")
