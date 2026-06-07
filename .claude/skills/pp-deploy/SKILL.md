---
name: pp-deploy
description: How to deploy and operate the Planning Poker app on Render (backend) and Vercel (frontend), with the main/dev branching model. Use when the user asks about deploying, releasing, checking deploy status, env vars, CORS, or staging environment.
---

# Planning Poker — Deploy Operations

## Branching model

Two long-lived branches:
- `main` → production
- `dev` → staging

**Never push to `main` without explicit user approval.** Standard flow: branch off `dev` → PR into `dev` → merge `dev` → `main` only when user OKs.

## Render (backend)

Source of truth: `render.yaml` at repo root. It defines a **Blueprint** with two services:

| Service | Branch | Healthcheck |
|---|---|---|
| `planning-poker-backend` | `main` | `/healthz` |
| `planning-poker-backend-dev` | `dev` | `/healthz` |

Both services use `rootDir: backend`, Python 3.12, uvicorn start command.

**To change deploy config**: edit `render.yaml`, commit, push. Render re-reads on push.

**`CORS_ORIGINS` env var** is `sync: false` — must be set per-service in the Render dashboard. The default is `*` only when unset (dev mode); in prod always explicit origins.

**Stale artifacts** (`backend/Dockerfile`, `Procfile`, `railway.toml`, `nixpacks.toml`) are unused on Render — Railway legacy.

## Vercel (frontend)

Single project, root dir `frontend`. Env var `VITE_API_URL` is scoped:
- Production (main) → `https://planning-poker-backend.onrender.com`
- Preview (dev / other branches) → `https://planning-poker-backend-dev.onrender.com`

In local dev, `VITE_API_URL` is empty → Vite proxies `/api` and `/ws` to `localhost:8000`.

**`CORS_ORIGINS` rule**: any new Vercel URL (preview alias, custom domain) must be added to `CORS_ORIGINS` on the matching Render service, otherwise CORS blocks the frontend.

## Cold starts

Render free tier sleeps after ~15min. First request after sleep can take ~30s. Frontend's WS hook auto-reconnects, so this is mostly transparent — but mention it in UAT.

## What CLI can do vs what needs Vercel/Render UI

CLI can:
- Read env vars (`vercel env ls`, `vercel env pull`).
- Edit `render.yaml`, push to git.
- Create branches, push.

CLI cannot:
- Connect a Vercel project to a GitHub repo (OAuth, UI-only).
- Add Preview env vars without a connected Git repo.
- Create a Render service tied to GitHub (requires Render GitHub App authorization in dashboard).

See [docs/DEPLOY_SETUP.md](../../../docs/DEPLOY_SETUP.md) for the one-time UI setup steps.

## Common operations

**Promote dev → main** (only with user OK):
```bash
git checkout main && git merge --ff-only dev && git push origin main
```
If non-ff: `git checkout main && git merge dev` (creates merge commit) then push.

**Hotfix on main**: branch off `main`, fix, push, PR. After merging to `main`, also merge `main` back into `dev` to keep dev caught up.

**Check Render logs**: `render logs <service>` if Render CLI installed, otherwise dashboard.

**Check Vercel deployment**: `vercel ls --scope vadims-projects-2f476800` or dashboard.

**Restart Render service** (e.g. after CORS_ORIGINS change): Render redeploys automatically on env change. Manual: dashboard → service → Manual Deploy.
