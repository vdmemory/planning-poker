# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Real-time Planning Poker tool for agile teams. Guest mode (no registration), WebSocket-based voting. All state is in-memory — no database, no persistence between restarts.

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
pytest                   # 92 tests, ~0.1s

# Frontend e2e (Playwright + Chromium)
cd frontend
npm install
npx playwright install chromium
npm run test:e2e         # 5 flows, ~15s
```

Test naming reads as the spec (`test_facilitator_cannot_become_spectator`). When adding business logic, add the test in the same PR — see `docs/RULES.md` rule 13.

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
│   ├── Home.tsx           # Room creation form
│   └── RoomPage.tsx       # Main game screen
├── components/
│   ├── Card.tsx           # Voting card
│   ├── PlayerList.tsx     # Players with offline indicator
│   ├── StatsPanel.tsx     # Average/median/distribution/consensus (shown after reveal)
│   └── IssueSidebar.tsx   # Issue list + add form (facilitator only)
├── hooks/
│   └── useRoomSocket.ts   # WebSocket with auto-reconnect; persists player_id in localStorage
└── types.ts               # Frontend types mirroring backend public_state()
```

## Key Design Decisions

**Layered backend**: `main.py` only parses HTTP/WS messages and delegates to `RoomService`. All logic lives in `services.py`, making it testable without a running server.

**Store as Protocol**: `store.py` defines `RoomStore` as a structural protocol. The global `store` singleton is `InMemoryRoomStore`. To add Redis, implement the protocol and swap the singleton.

**Votes hidden until reveal**: `Room.public_state()` returns `"hidden"` for all vote values until `room.revealed = True`. Only the list of who voted (`voted_player_ids`) is always visible.

**Permission-gated actions**: `update_room`, `kick_player`, `close_room` always require facilitator. `reveal` / `reset` are gated by `room.who_can_reveal` (`facilitator` | `everyone`). Issue actions (`add_issue`, `update_issue`, `delete_issue`, `delete_all_issues`, `reorder_issue`, `select_issue`, `set_estimate`) are gated by `room.who_can_manage_issues`. Helpers: `_require_facilitator()`, `_require_can_manage_issues()` in `RoomService`.

**Disconnect grace period**: On disconnect, `mark_disconnected` sets `connected=False` + timestamp. A background task (`cleanup_disconnected_players`, runs every 5s) removes players after 30s. If the player reconnects within that window, `reconnect()` clears the flag. `player_id` is stored in `localStorage` so page refresh = reconnect as the same player.

**Auto-join via URL**: The WS endpoint accepts `?player_id=...&nickname=...`. If `player_id` is not in the room but `nickname` is provided, it creates a new player automatically (enables sharing invite links).

**Facilitator handoff**: If the facilitator disconnects and is removed, the role passes to the first remaining player.

## WebSocket Protocol

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
{ type: "update_room", name?, deck_type?, card_back?, who_can_reveal?, who_can_manage_issues? }
{ type: "update_nickname", nickname }
{ type: "update_avatar_color", color }
{ type: "toggle_spectator" }                  # any non-facilitator player
{ type: "kick_player", target_player_id }     # facilitator
{ type: "close_room" }                        # facilitator

# Drawing / cursors (relay only, not stored)
{ type: "draw_stroke", ... }
{ type: "draw_cursor", ... }
{ type: "draw_clear" }
```

**Server → Client:**

```
{ type: "joined", player_id }
{ type: "room_state", state, stats? }   # stats present after reveal/revote
{ type: "countdown", seconds }          # relay
{ type: "kicked" }                      # to the kicked player
{ type: "room_closed" }
{ type: "draw_*" }                      # relay
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
