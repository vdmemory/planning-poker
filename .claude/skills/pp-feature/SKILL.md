---
name: pp-feature
description: How to add a new feature or modify business logic in the Planning Poker app. Use when implementing a new WebSocket message, changing room behavior, adding a new permission, or modifying voting/issue/player logic.
---

# Planning Poker — Adding Features

The backend is layered. Adding a feature touches **one** place per layer, not many. Use this checklist.

## 🛑 Definition of Done — every PR with new business logic

The user has explicitly reinforced this (RULES.md rule 13). A feature PR is NOT done until ALL THREE are in the same PR:

1. **Code** on the right layer (`services.py` for logic).
2. **Tests** — backend pytest for every new behavior + negative cases. Playwright e2e if user-visible.
3. **Docs** — `docs/BUSINESS_LOGIC.md` updated for the new rule, plus any other doc the change touches (see RULES.md rule #0 for the full audit list).

"I'll add tests/docs later" is NOT acceptable. If something genuinely can't fit, open a follow-up issue with `tech-debt` or `docs-debt` label and explicitly say so when handing off.

Why this matters: in three weeks no one remembers why `who_can_reveal=everyone` works the way it does. Tests and `BUSINESS_LOGIC.md` are the repo's memory. Without them every feature turns into magic no one wants to touch.

## Layers (top-down)

1. **`backend/app/models.py`** — Pydantic types. Add fields, enums, defaults.
2. **`backend/app/services.py`** — business logic. New method on `RoomService`.
3. **`backend/app/main.py:handle_message`** — WS dispatch. Add a new `elif msg_type == "..."` branch.
4. **`frontend/src/types.ts`** — mirror new fields from `public_state()`.
5. **`frontend/src/hooks/useRoomSocket.ts`** or specific component — call `sendMessage({type: "..."})`.

## Step-by-step for a new WS action

### Backend

1. **Decide who can do it.** Three patterns:
   - Always-facilitator: `_require_facilitator(room, player_id)` at the top.
   - Configurable: gate by `room.who_can_*` setting, fall back to facilitator check.
   - Self-only: just confirm the player exists in the room.

2. **Add the method to `RoomService`:**
   ```python
   def my_action(self, room_id: str, player_id: str, arg: str) -> None:
       room = self.get_room(room_id)
       self._require_facilitator(room, player_id)  # or appropriate gate
       # validate inputs — raise RoomError on bad input
       # mutate room
       self.store.save(room)
   ```

3. **Dispatch in `main.py:handle_message`:**
   ```python
   elif msg_type == "my_action":
       service.my_action(room_id, player_id, data["arg"])
   ```
   Don't write business logic here. Just unpack and delegate.

4. **The `room_state` broadcast at the bottom of `handle_message` runs automatically.** Don't add a second broadcast.

5. **If the action returns extra data (like `stats` after reveal):** add a special case at the bottom where `room_state` is built, similar to existing `reveal`/`revote`.

### Frontend

6. **Mirror new fields in `frontend/src/types.ts`** (one-to-one with `public_state()`).

7. **Call from a component:**
   ```ts
   sendMessage({ type: "my_action", arg: "value" });
   ```

8. **The UI updates via the next `room_state` broadcast.** Don't optimistically mutate state — let the server be the source of truth.

## Patterns

### Adding a new permission setting

If the action should be configurable (like `who_can_reveal`):
1. Add field to `Room` (default `"facilitator"`).
2. Add to `public_state()`.
3. Add to `update_room()` so facilitator can change it.
4. Gate the action: `if room.who_can_X == "facilitator": self._require_facilitator(...)` else check membership.
5. Add to `types.ts`.
6. Add UI control to the room settings panel.

### Adding a new deck

1. Add to `DeckType` enum and `DECKS` dict in `models.py`.
2. If the deck has non-numeric cards (like T-shirt) — `compute_stats` already handles this via `try/except float`.
3. No further changes needed.

### Adding a relay-only message (no state mutation)

For things like drawing or live cursors:
1. Don't add a service method.
2. Handle directly in `main.py:handle_message`:
   ```python
   elif msg_type in ("my_relay_thing",):
       await manager.broadcast_except(room_id, player_id, {**data, "player_id": player_id})
       return  # important: return before the room_state broadcast
   ```

## Don'ts

- Don't put business logic in `main.py`. It only parses and delegates.
- Don't mutate `room` outside `RoomService`. Use a service method.
- Don't bypass `_require_facilitator`/`_require_can_manage_issues`. Adding ad-hoc permission checks fragments the policy.
- Don't optimistically update the frontend; trust `room_state`.
- Don't forget `self.store.save(room)` after mutation — without it the change is lost on next read.
- Don't broadcast manually — `handle_message` does it after successful action.
- Don't add fields to `Room` without also updating `public_state()` and `types.ts`.

## Where to test

Tests are executable documentation — see `docs/TESTING.md`.

### Backend test (always required for service changes)

Add a test in the appropriate file under `backend/tests/`:
- new service method → file matching the area (rooms/voting/issues/permissions)
- new WS message type → `test_websocket.py`

Pattern: name the test as a sentence describing the expected behavior (e.g. `test_revote_recomputes_issue_estimate_from_new_mode`). Use the `service` fixture for service-level tests, `client` for WS/REST integration.

Run: `cd backend && pytest -k "your test name fragment"`.

### Frontend e2e test (when the change is user-visible)

Add a flow under `frontend/tests/e2e/`. Reuse helpers from `helpers.ts`:
- `createRoom(page)`, `joinRoom(page, url, nickname)`, `voteCard(page, value)`.

For multi-user flows, open `browser.newContext()` per user. The voteCard helper polls to work around the WS-handshake race; if you write your own action that uses WS, do the same (click in a loop until a server-observable state change appears).

Run: `cd frontend && npm run test:e2e`.

### Manual checks before merge

Even with the above tests, smoke-test in browser:
1. Backend + frontend running locally.
2. Open two browser profiles → create room in one, join from the other.
3. Trigger the new action; verify both clients see consistent state.
4. Verify errors go to sender only (`{type: "error", message}`), not broadcast.
