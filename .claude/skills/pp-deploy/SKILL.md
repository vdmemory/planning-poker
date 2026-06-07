---
name: pp-deploy
description: How to deploy, release, and operate the Planning Poker app on Render (backend) and Vercel (frontend). Covers the main/dev branching model, the auto-promote and release-please workflows, conventional commits, and tag/release management. Use when the user asks about deploying, releasing, checking deploy status, env vars, CORS, or staging environment.
---

# Planning Poker — Deploy & Release Operations

## Branching model

Two long-lived branches:
- `main` → production
- `dev` → staging

**Never push to `main` without explicit user approval.** Standard flow: branch off `dev` → PR into `dev` → auto-promote workflow opens PR `dev → main` → user reviews and merges → release-please opens release PR → user merges → `v0.X.Y` tag.

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

## Release automation (two workflows)

### auto-promote (`.github/workflows/auto-promote.yml`)

Triggers on push to `dev`. If there is no open PR `dev → main`, it opens one titled `chore: promote dev to main` with a generated body listing the commits since main and a note "merge with Create a merge commit, not squash". If an open PR already exists, it does nothing (GitHub auto-tracks new commits onto an open PR).

This means: as features merge into dev, the user always has one PR sitting in their inbox aggregating "what's pending for the next release".

### release-please (`.github/workflows/release-please.yml`)

Triggers on push to `main`. Reads commits since the last tag, computes the next semver per conventional commits rules, opens a release PR titled `chore(main): release 0.X.Y` containing CHANGELOG.md regenerated and `frontend/package.json` version bumped. When the release PR merges, release-please tags the merge commit (e.g. `v0.2.0`) and creates a GitHub Release.

### Merge methods (critical)

| Hop | Method | Why |
|---|---|---|
| `feature → dev` | **Squash and merge** | The PR title becomes the squashed commit. So the PR title MUST be a conventional commit, e.g. `feat: name pill above card`. |
| `dev → main` | **Create a merge commit** | Squash here would collapse all `feat:`/`fix:` inside into the single PR title, and release-please would miss the individual entries. Merge commit preserves them. |
| `release PR → main` | Squash (default) | The release PR has one bot-authored commit; either method works. |

Repo enforces: `allow_squash_merge=true`, `allow_merge_commit=true`, `allow_rebase_merge=false`, `delete_branch_on_merge=true`.

### Required-CI gotcha on release PRs

`GITHUB_TOKEN`-authored commits don't trigger workflows (GitHub anti-recursion guard). Release-please uses `GITHUB_TOKEN`, so on a fresh release PR the required `Backend pytest` / `Frontend Playwright e2e` stay at "Expected — Waiting for status to be reported".

Workaround:
```bash
git fetch origin release-please--branches--main
git checkout release-please--branches--main
git commit --allow-empty -m "ci: re-trigger required CI on release PR"
git push
git checkout dev
```

Permanent fix (not yet wired) would be a fine-grained PAT scoped to this repo with `contents:write`, `pull-requests:write`, `workflows:write`, passed to `release-please-action` via the `token:` input.

## Common operations

**Take an issue** (Claude in this session): user says e.g. "take #N". Read the issue + its auto-triage comment, branch from `dev`, implement, add tests, update relevant docs, open PR `feat/issue-N-...` → `dev` with a conventional commit title and `Closes #N` in the body.

**Promote dev → main** (release moment): merge the open auto-promote PR via **Create a merge commit** (NOT squash). If no PR is open, push any conventional commit to dev — the auto-promote workflow opens one.

**Cut a release**: after a dev→main merge, the release-please PR appears automatically. Empty-commit it (see "Required-CI gotcha"), review the CHANGELOG, squash-merge. Tag and GitHub Release appear within ~30 seconds.

**Hotfix on main**: branch off `main`, fix with `fix:` conventional commit, PR back to `main` directly (skip dev) — patch-only, urgent. After merging to `main`, immediately merge `main` back into `dev` so dev stays caught up.

**Check Render logs**: dashboard, or `render logs <service>` if Render CLI is installed.

**Check Vercel deployment**: `vercel ls --scope vadims-projects-2f476800` or dashboard.

**Restart Render service** (e.g. after `CORS_ORIGINS` change): Render redeploys automatically on env change. Manual: dashboard → service → Manual Deploy.

**See current version**: `cat frontend/package.json | grep version` or look at the top of `CHANGELOG.md`.
