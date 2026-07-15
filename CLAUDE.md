# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

> **Documentation is part of Definition of Done.** Before saying "done" or opening a PR, audit the docs listed in `docs/RULES.md` rule #0 and update anything touched by the change. Stale docs are bugs. The user has reinforced this rule explicitly.

## Project Overview

Real-time Planning Poker tool for agile teams. Guest mode (no registration), WebSocket-based voting. All state is in-memory — no database, no persistence between restarts.

**Retro Board** (issue #62) is a second, fully independent product on the same site — a WebSocket-based retrospective board (5 column templates: the extended What went well/To improve/Risks/Action items/Team's processes template — the default, issue #67 — plus a shorter What went well/To improve/Action items variant, Mad/Sad/Glad, Start/Stop/Continue, and 4Ls). It shares no code with Planning Poker's `Room`/`RoomService` beyond the domain-agnostic `ConnectionManager`. Phase 1 shipped the core board (cards, voting, timer, moderation); Phase 2 added drag-to-merge card grouping, emoji reactions on cards, and mobile adaptation; a follow-up brought the header UI to parity with Planning Poker (board settings modal, participant profile menu) and added the on-screen drawing tool; a further follow-up (issue #67) added the two extra templates above. See `docs/RETRO_BUSINESS_LOGIC.md` for business logic and the "Retro Board" subsection below for architecture.

## Running Locally

**Backend** (FastAPI + uvicorn, port 8000):
```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload
```

**Frontend** (Vite + React, port 5173):
```bash
cd frontend
npm run dev
```

Vite proxies `/api` → `http://localhost:8000` and `/ws` → `ws://localhost:8000`, so no env vars needed in dev.

## Building

```bash
# Frontend
cd frontend && npm run build   # tsc + vite build

# Backend has no build step; deployed via Render (render.yaml at repo root)
```

## Testing

Two layers, both treated as executable documentation (`docs/TESTING.md`):

```bash
# Backend (pytest + FastAPI TestClient + WebSocket)
cd backend && source .venv/bin/activate && pip install -r requirements-dev.txt
pytest                   # 221 tests (125 Planning Poker + 96 Retro Board), ~0.1s

# Frontend e2e (Playwright + Chromium)
cd frontend
npm install
npx playwright install chromium
npm run test:e2e         # 82 tests (52 Planning Poker/shared + 30 Retro Board), ~2 min
```

Test naming reads as the spec (`test_facilitator_cannot_become_spectator`). When adding business logic, add the test **and** update `docs/BUSINESS_LOGIC.md` in the same PR — see `docs/RULES.md` rule 13 (Definition of Done for new business logic). This is non-negotiable; "later" doesn't work.

CI runs both layers on every push to `main`/`dev` and on PRs — `.github/workflows/ci.yml`. Concurrency is set so a new push cancels the prior run on the same branch.

## Releases

The flow is "feature branch goes straight to `main`; `dev` is a staging mirror":

1. Developer pushes a `feat/…` / `fix/…` / `chore/…` / `refactor/…` / `docs/…` branch.
2. **Sync-to-dev** (`.github/workflows/sync-to-dev.yml`) merges the branch into `dev` so the dev backend on Render + the `git-dev` Vercel alias auto-deploy a preview.
3. **Auto-PR-to-main** (`.github/workflows/auto-pr-to-main.yml`) opens (or reuses) a PR from that same branch into `main`. Title defaults to `<prefix>: <rest-of-branch>` — edit it to a clean message before merging since it becomes the squash-commit on `main`.
4. **Back-merge** (`.github/workflows/back-merge.yml`) — on every push to `main`, merges `main` back into `dev` so any direct-to-main fixup or hotfix lands in the staging mirror too.

There is no separate release step. Push to `main` deploys to production (Render + Vercel) — that's the entire release. No version tagging, no CHANGELOG generation, no GitHub Releases. Conventional Commit prefixes (`feat:`, `fix:`, etc.) are a soft convention, not a tool requirement.

Merge method: **feature → main = squash** (the PR title becomes the single Conventional Commit on `main`). `dev` only accumulates merge commits from the sync workflow — never merge anything into `dev` manually. There is no `dev → main` PR anymore (the old auto-promote workflow is removed).

Branch protection: both `main` and `dev` have `allow_deletions: false` and `allow_force_pushes: false`. `main` additionally requires the two CI jobs to be green; the "branch up to date" requirement is **off** because feature branches deliberately fan out from various base points and we want squash-merge to handle the reconciliation. `dev` is intentionally softer — no required checks — so the sync-to-dev and back-merge bot pushes aren't blocked. See `docs/RULES.md` rule 20 for the full setting list.

See `docs/RELEASES.md` for the full flow and `docs/RULES.md` rule 2 for the merge-method rationale.

## Architecture

Two independent services, no shared code:

```
backend/app/
├── models.py      # Pydantic domain models: Room, Player, Issue, DeckType, DECKS
├── store.py       # RoomStore Protocol + InMemoryRoomStore singleton (swap for Redis here)
├── services.py    # RoomService — all business logic, framework-agnostic
├── ws_manager.py  # ConnectionManager (room→player→WebSocket map) + cleanup background task
└── main.py        # FastAPI: POST /api/rooms, GET /api/rooms/{id}, WS /ws/{room_id}

frontend/src/
├── pages/
│   ├── LandingPage.tsx    # Marketing landing page on `/` (issue #22) — one section per product (follow-up)
│   ├── FAQPage.tsx        # `/faq` — questions grouped by product (follow-up)
│   ├── Home.tsx           # Room creation form, now on `/new`
│   └── RoomPage.tsx       # Main game screen
├── components/
│   ├── MarketingShell.tsx # Shared header/footer for landing + FAQ, links to both products
│   ├── Card.tsx           # Voting card
│   ├── PlayerList.tsx     # Players with offline indicator
│   ├── StatsPanel.tsx     # Average/median/distribution/consensus (shown after reveal)
│   └── IssueSidebar.tsx   # Issue list + add form (facilitator only)
├── hooks/
│   └── useRoomSocket.ts   # WebSocket with auto-reconnect; persists player_id in localStorage
└── types.ts               # Frontend types mirroring backend public_state()
```

### Retro Board (parallel domain)

```
backend/app/
├── retro_models.py      # RetroTemplate, RetroColumn, RETRO_TEMPLATES, RetroParticipant, RetroCard, RetroBoard
├── retro_store.py       # RetroBoardStore Protocol + InMemoryRetroBoardStore
├── retro_service.py     # RetroService — all business logic
├── retro_ws_manager.py  # reuses ConnectionManager; own cleanup tasks (different field names)
└── main.py              # + POST/GET /api/retro-boards, WS /ws/retro/{board_id}, handle_retro_message

frontend/src/
├── pages/
│   ├── RetroNewPage.tsx    # `/retro/new` — board creation form
│   └── RetroBoardPage.tsx  # `/retro/:boardId` — join modal + board screen
├── components/
│   ├── RetroTemplatePicker.tsx
│   ├── RetroColumn.tsx           # renders card "stacks" (head + grouped children)
│   ├── RetroCardItem.tsx         # ONE never-grouped card: inline-edit, vote, drag grip, reactions
│   ├── RetroCardStack.tsx        # merged card: texts joined by "---", one shared vote/author, undo
│   ├── RetroCardReactionBar.tsx  # Phase 2 — click-triggered emoji popover per card
│   ├── RetroTimer.tsx
│   ├── RetroSettingsModal.tsx    # follow-up — clone of GameSettingsModal, opened by clicking the board name (facilitator only), replaced the old RetroSettingsDropdown
│   └── RetroProfileMenu.tsx      # follow-up — clone of ProfileMenu minus the spectator toggle, opened by clicking the participant's avatar
└── hooks/
    ├── useRetroSocket.ts
    ├── useRetroCardDrag.ts        # Phase 2 — Pointer Events drag-to-merge (not HTML5 DnD)
    └── useRetroCardReactions.ts   # Phase 2 — on-card reaction overlay, no floaters
```

Drawing (follow-up): `DrawingCanvas` (`frontend/src/components/DrawingCanvas.tsx`) is reused as-is from Planning Poker — no fork. The only integration point is the backend relay in `handle_retro_message`, which forwards `draw_stroke`/`draw_cursor`/`draw_clear` to everyone except the sender via `ConnectionManager.broadcast_except`, aliasing `player_id: participant_id` on the wire since that's the field name `DrawingCanvas` expects.

Full architecture writeup: `docs/ARCHITECTURE.md` → "Retro Board".

## Key Design Decisions

**Layered backend**: `main.py` only parses HTTP/WS messages and delegates to `RoomService`. All logic lives in `services.py`, making it testable without a running server.

**Store as Protocol**: `store.py` defines `RoomStore` as a structural protocol. The global `store` singleton is `InMemoryRoomStore`. To add Redis, implement the protocol and swap the singleton.

**Votes hidden until reveal**: `Room.public_state()` returns `"hidden"` for all vote values until `room.revealed = True`. Only the list of who voted (`voted_player_ids`) is always visible.

**Permission-gated actions**: `update_room`, `kick_player`, `close_room` always require facilitator. `reveal` / `reset` are gated by `room.who_can_reveal` (`facilitator` | `everyone`). Issue actions (`add_issue`, `update_issue`, `delete_issue`, `delete_all_issues`, `reorder_issue`, `select_issue`, `set_estimate`) are gated by `room.who_can_manage_issues`. Helpers: `_require_facilitator()`, `_require_can_manage_issues()` in `RoomService`.

**Disconnect grace period**: On disconnect, `mark_disconnected` sets `connected=False` + timestamp. A background task (`cleanup_disconnected_players`, runs every 5s) removes players after 30s. If the player reconnects within that window, `reconnect()` clears the flag. `player_id` is stored in `localStorage` so page refresh = reconnect as the same player.

**Room expiration**: A room has `expires_at` set on creation (`services.ROOM_LIFETIME`, default 24h). A second background task (`cleanup_expired_rooms`, runs every 60s) broadcasts `{type: "room_expired", reason: "timer"}`, closes WS connections, and removes the room. `get_room` raises `RoomError("Room has expired")` before cleanup runs, so every action fails fast. The frontend renders a full-screen `room-inactive-overlay` based on a typed WS message, NOT on the close code — Render's Cloudflare edge proxy strips custom close codes (4000-4999) and the browser sees 1005 regardless. For a fresh connect to a missing/expired room the server sends `{type: "room_inactive", reason: "not_found"|"expired"}` before closing. The same overlay component handles three more states: `roomInactive="closed"` (issue #19, facilitator closed/left) and `roomInactive="kicked"` (issue #37, this user was kicked) — each with its own icon, title, and copy.

**Auto-join via URL**: The WS endpoint accepts `?player_id=...&nickname=...`. If `player_id` is not in the room but `nickname` is provided, it creates a new player automatically (enables sharing invite links).

**Facilitator handoff**: If the facilitator disconnects and is removed, the role passes to the first remaining player. The facilitator can opt out of handoff via `close_on_facilitator_leave` (issue #19) — when enabled, dropping the facilitator closes the room for everyone (broadcast `{type: "room_closed", reason: "creator_left"}`) instead of handing the role off.

**Throw reactions** (issue #51): `room.fun_features_enabled` (facilitator-only, off by default, set via `update_room`) gates `throw_reaction` — a reaction aimed at a specific player's card, hover/tap-triggered from `ThrowReactionBar` on `PlayerCard`. Purely ephemeral relay like `reaction`/`draw_*`/`countdown`, not stored on `Room`. Distinct from the issue #32 self-reaction system (`reaction` type, `ReactionsPanel`/`ReactionFloater`) — both exist side by side.

**Retro Board cards are never hidden** (issue #62): unlike Planning Poker's `revealed` gate, retro cards and vote counts are visible to everyone immediately — no per-viewer `public_state()` needed. **Anonymous mode is display-only**: `author_id` always stays on the wire for permission checks; the frontend just hides the nickname label for non-authors when `anonymous_mode` is on. **Timer uses an absolute deadline** (`timer_ends_at`), not a server tick — clients compute their own live countdown, avoiding a new per-board background task. **Card grouping (Phase 2)** uses `RetroCard.group_id` (one hop max: a head's own `group_id` is always `None`) and Pointer Events on the frontend (`onPointerDown` + `setPointerCapture`), not HTML5 drag-and-drop, since that API doesn't fire on touch devices. Merging shows a confirm dialog before sending, and merged cards render as `RetroCardStack` — ONE card with each original text separated by "---", one shared vote (union of voters) and author (the head's), and a persistent undo button that calls `ungroup_card`. **Card reactions (Phase 2)** are a pure ephemeral relay (`react_to_card` → `card_reaction`), nothing persisted, same pattern as `reaction`/`throw_reaction`. Full rules: `docs/RETRO_BUSINESS_LOGIC.md`.

## WebSocket Protocol

> Below is the **Planning Poker** (`/ws/{room_id}`) protocol. Retro Board's parallel protocol (`/ws/retro/{board_id}`) is documented in `docs/RETRO_BUSINESS_LOGIC.md`.

**Client → Server** (full list — see `main.py:handle_message`):

```
# Voting
{ type: "vote", card: "5" }
{ type: "revote", card: "8" }                 # after reveal; recomputes stats + final_estimate
{ type: "reveal" }                            # who_can_reveal
{ type: "reset" }                             # who_can_reveal
{ type: "countdown", seconds: 3 }             # relayed to all clients

# Issues
{ type: "add_issue", title, description?, link? }
{ type: "update_issue", issue_id, title?, description?, link? }
{ type: "delete_issue", issue_id }
{ type: "delete_all_issues" }
{ type: "reorder_issue", issue_id, direction: "top"|"up"|"down"|"bottom" }
{ type: "select_issue", issue_id }
{ type: "set_estimate", issue_id, estimate }

# Room / player
{ type: "update_room", name?, deck_type?, card_back?, who_can_reveal?, who_can_manage_issues?, close_on_facilitator_leave?, fun_features_enabled? }
{ type: "update_nickname", nickname }
{ type: "update_avatar_color", color }
{ type: "toggle_spectator" }                  # any non-facilitator player
{ type: "kick_player", target_player_id }     # facilitator
{ type: "close_room" }                        # facilitator

# Drawing / cursors (relay only, not stored)
{ type: "draw_stroke", ... }
{ type: "draw_cursor", ... }
{ type: "draw_clear" }

# Reactions (relay to all incl. sender)
{ type: "reaction", kind: "emoji" | "number", value }
{ type: "throw_reaction", target_player_id, value }  # issue #51; requires room.fun_features_enabled
```

**Server → Client:**

```
{ type: "joined", player_id }
{ type: "room_state", state, stats? }   # stats present after reveal/revote
{ type: "countdown", seconds }          # relay
{ type: "kicked" }                      # to the kicked player — frontend renders the "You were removed" overlay (issue #37) and disables reconnect
{ type: "room_closed", reason }         # facilitator closed the room or left a close-on-leave room (reason: creator_left) — issue #19
{ type: "room_expired", reason }        # timer ran out, sent to already-connected clients (cleanup_expired_rooms)
{ type: "room_inactive", reason }       # fresh WS connect to a missing/expired room (reason: not_found | expired)
{ type: "draw_*" }                      # relay
{ type: "thrown_reaction", from_player_id, from_nickname, from_avatar_color, target_player_id, value }  # relay, issue #51
{ type: "error", message }
```

After every successful WS operation that mutates room state, the server broadcasts `room_state` to all room members. `draw_*` and `countdown` are relayed without a state broadcast.

## Branching & Deployment

**Two long-lived branches**: `main` (production) and `dev` (staging). **Never push to `main` without the user's explicit approval.** Standard flow: branch off `dev` → PR into `dev` → merge `dev` → `main` only when user OKs.

Each branch has its own backend service on Render and its own frontend URL on Vercel:

| Branch | Render service | Vercel URL |
|---|---|---|
| `main` | `planning-poker-backend` | `<project>.vercel.app` (Production) |
| `dev`  | `planning-poker-backend-dev` | `<project>-git-dev-<owner>.vercel.app` (Preview) |

### Render (backend)

Single Blueprint defined in `render.yaml` at the repo root. Both services share the same `rootDir: backend`, healthcheck, build/start commands — they differ only in `branch:` and `name:`.

1. First-time setup: Render Dashboard → Blueprints → New Blueprint Instance → connect GitHub repo. Render reads `render.yaml` and creates both services.
2. For each service, set `CORS_ORIGINS` in Environment (comma-separated, no trailing slash) to the matching Vercel URL.
3. Verify: `/healthz` on each service returns `{"status":"ok"}`.

What `render.yaml` defines (per service): `runtime: python`, `PYTHON_VERSION=3.12.0`, `buildCommand: pip install -r requirements.txt`, `startCommand: uvicorn app.main:app --host 0.0.0.0 --port $PORT`, `healthCheckPath: /healthz`.

Stale platform artifacts left in `backend/` (`Dockerfile`, `Procfile`, `railway.toml`, `nixpacks.toml`) are unused on Render.

### Vercel (frontend)

Single Vercel project, env vars scoped by environment:

- Root Directory: `frontend`. Production Branch: `main`.
- `VITE_API_URL` env var:
  - Production scope → prod Render URL
  - Preview scope → dev Render URL
- Vercel auto-creates a stable alias `<project>-git-dev-<owner>.vercel.app` for the latest `dev` commit. Add that URL to `CORS_ORIGINS` on the dev Render service.

`frontend/vercel.json` sets build config. `frontend/.env.example` documents env vars.

In dev (local), leave `VITE_API_URL` empty — Vite proxy handles `/api` and `/ws`.

### CORS

In dev (local), `CORS_ORIGINS` is unset → `allow_origins=["*"]`.
In prod/staging, Render reads `CORS_ORIGINS` and restricts to those origins. After changing the env var, Render redeploys automatically.

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Render 502 / "Application failed to respond" | Build failure or missing deps | Render → Logs; check `requirements.txt` |
| `ModuleNotFoundError: No module named 'app'` | `rootDir` not respected | Confirm `render.yaml` has `rootDir: backend` |
| Frontend "Failed to fetch" on room create | `VITE_API_URL` not set or wrong | Vercel → Settings → Env Vars; redeploy |
| CORS error in browser | `CORS_ORIGINS` missing Vercel domain | Render → Environment → check `CORS_ORIGINS` has `https://` prefix and no trailing `/` |
| WebSocket "reconnecting…" loop | `VITE_API_URL` uses `http://` instead of `https://` | WS auto-upgrades to `wss://` only from `https://` origin |
| Players don't see each other | Using different Vercel URLs (production vs preview) | Use only the production URL, or add preview URLs to `CORS_ORIGINS` |
| Cold start timeout on first WS connect | Render free tier sleeps after inactivity (~15 min) | Wait ~30s, page will reconnect |

### Costs & scaling

- **Vercel**: free for personal projects.
- **Render**: free tier sleeps after inactivity; paid plans avoid cold starts.

**Adding Redis** (when scaling is needed):
1. Provision Redis (Render Key Value, Upstash, or another provider) → copy `REDIS_URL`.
2. Implement `RedisRoomStore` satisfying the `RoomStore` protocol in `store.py` (~50 lines).
3. Add `REDIS_URL` env var to the backend service; swap the `store` singleton.

**Horizontal scaling**: requires Redis pub/sub for WebSocket broadcast across pods — changes in `ws_manager.py`.

## Decks

Defined in `models.py:DECKS`. Currently `fibonacci`, `powers_of_2`, `sequential`, `tshirt`. Cards are strings to handle `"?"`, `"☕"`, and T-shirt sizes uniformly. Stats (`compute_stats`) only include numeric cards in average/median calculations; non-numeric still appear in `distribution`.
