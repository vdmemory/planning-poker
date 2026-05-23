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

# Backend has no build step; deploy via Docker or nixpacks (see backend/Dockerfile, backend/nixpacks.toml)
```

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

**Facilitator-only actions**: `reveal`, `reset`, `add_issue`, `select_issue`, `set_estimate` require `room.facilitator_id == player_id`, enforced via `_require_facilitator()` in `RoomService`.

**Disconnect grace period**: On disconnect, `mark_disconnected` sets `connected=False` + timestamp. A background task (`cleanup_disconnected_players`, runs every 5s) removes players after 30s. If the player reconnects within that window, `reconnect()` clears the flag. `player_id` is stored in `localStorage` so page refresh = reconnect as the same player.

**Auto-join via URL**: The WS endpoint accepts `?player_id=...&nickname=...`. If `player_id` is not in the room but `nickname` is provided, it creates a new player automatically (enables sharing invite links).

**Facilitator handoff**: If the facilitator disconnects and is removed, the role passes to the first remaining player.

## WebSocket Protocol

**Client → Server:**
```
{ type: "vote", card: "5" }
{ type: "reveal" }            # facilitator only
{ type: "reset" }             # facilitator only
{ type: "add_issue", title, description? }   # facilitator only
{ type: "select_issue", issue_id }           # facilitator only
{ type: "set_estimate", issue_id, estimate } # facilitator only
```

**Server → Client:**
```
{ type: "joined", player_id }
{ type: "room_state", state, stats? }   # stats present only after reveal
{ type: "error", message }
```

After every successful WS operation, the server broadcasts `room_state` to all room members.

## Deployment

Frontend → **Vercel**, Backend → **Railway**. See `deploy-guide.md` for step-by-step UI clicks.

### Railway (backend)

1. New Project → Deploy from GitHub repo → select `planning-poker`
2. Service Settings → Source → **Root Directory: `backend`**
3. Settings → Networking → **Generate Domain** → copy the `*.up.railway.app` URL
4. Variables → add `CORS_ORIGINS` = Vercel URL(s), comma-separated, no trailing slash:
   ```
   https://your-app.vercel.app,https://your-app-xxxx.vercel.app
   ```
5. Verify: `https://your-railway-url.up.railway.app/healthz` → `{"status":"ok"}`

Relevant files: `backend/railway.toml`, `backend/nixpacks.toml` (pins Python 3.12), `backend/Procfile`.

### Vercel (frontend)

1. Add New Project → Import `planning-poker`
2. Configure Project → Root Directory: **`frontend`** (framework auto-detects as Vite)
3. Environment Variables → add `VITE_API_URL` = Railway URL (e.g. `https://planning-poker-production-XXXX.up.railway.app`)
   - Enable for Production, Preview, Development
4. Deploy → copy the `*.vercel.app` URL

`frontend/vercel.json` sets build config. `frontend/.env.example` documents env vars.

In dev, leave `VITE_API_URL` empty — Vite proxy handles `/api` and `/ws`.

### CORS

In dev, `CORS_ORIGINS` is unset → `allow_origins=["*"]`.  
In prod, Railway reads `CORS_ORIGINS` and restricts to those origins. After changing `CORS_ORIGINS`, Railway restarts automatically (~30s).

### Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Railway 502 / "Application failed to respond" | Wrong Root Directory or missing deps | Check Deployments → View Logs; confirm Root Directory = `backend` |
| `ModuleNotFoundError: No module named 'app'` | Root Directory not set | Settings → Source → Root Directory = `backend` |
| Frontend "Failed to fetch" on room create | `VITE_API_URL` not set or wrong | Vercel → Settings → Env Vars; then Redeploy |
| CORS error in browser | `CORS_ORIGINS` missing Vercel domain | Railway → Variables → check `CORS_ORIGINS` has `https://` prefix and no trailing `/` |
| WebSocket "reconnecting…" loop | `VITE_API_URL` uses `http://` instead of `https://` | WS auto-upgrades to `wss://` only from `https://` origin |
| Players don't see each other | Using different Vercel URLs (production vs preview) | Use only the production URL |
| Cold start timeout on first WS connect | Railway free tier sleeps after inactivity | Wait ~30s, page will reconnect |

### Costs & scaling

- **Vercel**: free for personal projects
- **Railway**: $5/month free credits; sufficient for internal team tool under normal load

**Adding Redis** (when scaling is needed):
1. Railway → + New → Database → Redis → copy `REDIS_URL`
2. Implement `RedisRoomStore` satisfying the `RoomStore` protocol in `store.py` (~50 lines)
3. Add `REDIS_URL` env var to the backend service; swap the `store` singleton

**Horizontal scaling**: requires Redis pub/sub for WebSocket broadcast across pods — changes in `ws_manager.py`.

## Decks

Defined in `models.py:DECKS`. Currently `fibonacci` and `tshirt`. Cards are strings to handle `"?"` and T-shirt sizes uniformly. Stats (`compute_stats`) only include numeric cards in average/median calculations.
