# Releases

This repo uses [release-please](https://github.com/googleapis/release-please) (Google) to manage versions, changelog, and GitHub Releases automatically.

## Versioning

Semver, currently `0.1.0` (pre-1.0 means "still evolving — minor bumps may break things").

- `feat:` → minor bump while pre-1.0 (e.g. `0.1.0 → 0.2.0`)
- `fix:`, `perf:`, `refactor:` → patch bump (e.g. `0.1.0 → 0.1.1`)
- `BREAKING CHANGE:` footer or `feat!:` / `fix!:` → major bump
- `chore:`, `ci:`, `docs:`, `test:`, `build:`, `style:` → no version bump unless they appear together with something else

After we reach feature parity / want a public 1.0, bump manually (release-please supports `Release-As: 1.0.0` footer in a commit).

## Lifecycle

The flow is "feature branch → main directly; dev is a staging mirror":

```
┌──────────────────────────┐
│ push feat/foo branch     │  developer commits + pushes
└──────────────────────────┘
            │
            ├─► sync-to-dev workflow merges feat/foo into dev (preview deploy)
            │
            └─► auto-pr-to-main workflow opens PR feat/foo → main (if absent)
                            ↓
            ┌──────────────────────────┐
            │ review + squash to main  │  PR title = conventional commit
            └──────────────────────────┘
                            ↓
            ┌──────────────────────────┐
            │ release-please           │  opens release PR with CHANGELOG + bump
            └──────────────────────────┘
                            ↓
            ┌──────────────────────────┐
            │ merge release PR         │  tag vX.Y.Z + GitHub Release
            └──────────────────────────┘
                            ↓
            ┌──────────────────────────┐
            │ back-merge main → dev    │  version bump propagates to staging
            └──────────────────────────┘
```

### Step-by-step

1. **Develop on a feature branch** branched from `main` (or `dev` — both work). Use the prefixes the sync/auto-PR workflows watch: `feat/`, `fix/`, `chore/`, `refactor/`, `docs/`.
2. Commits within the branch can be anything — they get squashed. Only the **final PR title** has to be a [Conventional Commit](https://www.conventionalcommits.org/) (e.g. `feat: telegram login widget on home page`). Release-please reads the squash-merge message verbatim.
3. **Push the branch.** Two workflows fire in parallel on every push:
   - **Sync-to-dev** (`.github/workflows/sync-to-dev.yml`) merges the branch into `dev`. Render's dev backend + the `git-dev` Vercel alias auto-deploy a preview.
   - **Auto-PR-to-main** (`.github/workflows/auto-pr-to-main.yml`) opens a PR from your branch into `main` (or no-ops if one already exists). Title defaults to `<prefix>: <rest-of-branch-name>` — edit it before merging.
4. **Review the PR, watch CI, fix any e2e/pytest failures**, then **Squash and merge** into `main`.
5. **Release-please workflow** (`.github/workflows/release-please.yml`) runs on the push to `main`:
   - Reads commits since the last release tag.
   - Computes the next version per Conventional Commits rules.
   - Updates `CHANGELOG.md` and `frontend/package.json`'s `version` field.
   - Updates `.release-please-manifest.json`.
   - Opens a release PR titled like `chore(main): release 0.2.0`.
6. **Review the release PR**:
   - Check the generated CHANGELOG section.
   - If anything is wrong (wrong category, missing item), close the PR, add a commit that fixes it, and the workflow will open a fresh release PR.
7. **Merge the release PR** (squash is fine here — the release PR has exactly one bot-authored commit). Release-please then:
   - Tags the merge commit `v0.2.0`.
   - Creates a GitHub Release with the changelog section as the body.
8. **Back-merge** (`.github/workflows/back-merge.yml`) fires on the same push to `main` and merges the version bump + CHANGELOG into `dev` so the staging mirror stays current.

### Why these automation layers

- **Sync-to-dev** (`sync-to-dev.yml`) keeps the staging deploy in sync with whatever you're actively working on, no manual `git push origin feat:dev` needed.
- **Auto-PR-to-main** (`auto-pr-to-main.yml`) means you never have to click "Compare & pull request" — by the time your tests are green locally, the PR is already on GitHub waiting for review.
- **Release-please** (`release-please.yml`) answers "what's in this release?" — the release PR is your finalized changelog.
- **Back-merge** (`back-merge.yml`) keeps `dev`'s `package.json` version and `CHANGELOG.md` aligned with `main` after every release / hotfix.

### What the sync-to-dev workflow does

After a push to a feature branch:
1. Checks out `dev`, fetches the feature branch.
2. If `dev` already contains the branch's HEAD — exits (nothing to do, the same SHA was pushed twice).
3. Tries `git merge --no-ff origin/<branch>` with a `Mirror <branch> → dev (staging)` message.
4. If clean — `git push origin dev`. Preview redeploys automatically.
5. If conflict — fails, comments on the PR (if one is already open) with a `git rebase` recipe, and waits for the next push.

The "Mirror …" prefix is also what back-merge's skip filter looks for in the inverse direction — clean loop, no recursion.

### What the back-merge workflow does

After a push to `main` (release PR merged, hotfix landed):
1. Checks out `dev`, fetches latest `main`.
2. If `dev` already contains `main`'s HEAD — exits.
3. Tries `git merge --no-ff origin/main` with a `Merge branch 'main' into dev (back-merge after release)` message.
4. If clean — `git push origin dev`.
5. If conflict — opens an issue labeled `tech-debt` with the resolution recipe. You merge manually.

### "Required CI on release PR" gotcha

GitHub Actions, by design, does NOT trigger workflows on commits authored by `GITHUB_TOKEN`. Release-please uses `GITHUB_TOKEN`, so the required `Backend pytest` / `Frontend Playwright e2e` status checks stay at "Expected — Waiting for status to be reported" on a fresh release PR.

Workaround until we wire a fine-grained PAT into release-please:

```bash
git fetch origin release-please--branches--main
git checkout release-please--branches--main
git commit --allow-empty -m "ci: re-trigger required CI on release PR"
git push
git checkout dev  # back to your usual branch
```

This empty commit is authored by you (not the bot), so it fires the `pull_request:synchronize` event and CI starts. About 30 seconds of typing per release.

If this gets annoying, switch to a fine-grained PAT (90-day rotation, scoped to this repo only with `contents:write` + `pull-requests:write` + `workflows:write`) and add it as the `token:` input to `release-please-action`.

## Configuration

- [`release-please-config.json`](../release-please-config.json) — release type (`simple`), changelog sections, files to bump (`frontend/package.json` version).
- [`.release-please-manifest.json`](../.release-please-manifest.json) — current version per package (just `.`: `0.1.0`).

To override the next version, add a single commit with this footer:

```
Release-As: 1.0.0
```

(useful for the first 1.0.0 release after feature parity).

## What gets shown in the CHANGELOG

| Commit type | CHANGELOG section | Bumps version |
|---|---|---|
| `feat:` | Features | minor (pre-1.0) / minor (post-1.0) |
| `fix:` | Bug Fixes | patch |
| `perf:` | Performance | patch |
| `refactor:` | Refactor | patch |
| `docs:` | Documentation | no |
| `ci:` | CI / Tooling | no |
| `test:` | Tests | no |
| `chore:` | hidden | no |
| `build:` | hidden | no |
| `style:` | hidden | no |
| `BREAKING CHANGE:` / `feat!` | "BREAKING CHANGES" header in release | **major** |

(`hidden` sections are still in git; just not surfaced in the release notes.)

## FAQ

**Can I edit CHANGELOG.md manually?**
Don't. Release-please rewrites the top of the file every release. To add narrative for a release, do it in the release PR body (it lands in the GitHub Release notes, not the CHANGELOG file).

**What if I forget to use a conventional prefix on the PR title?**
The squashed commit will be ignored by release-please. The change still ships, just won't appear in the CHANGELOG. You can edit the squash commit message on `main` (force-push to main is off, but you can revert + redo) or add a follow-up PR with the right prefix.

**What if a non-feat commit should actually trigger a release?**
Add `Release-As:` footer with the desired version to force a release.

**Does this auto-deploy?**
- **Staging (dev backend on Render + `git-dev` Vercel alias)**: auto-deploys on every push to `dev`, which now happens automatically via `sync-to-dev`. So pushing a feature branch ≈ deploying to staging.
- **Production (main backend on Render + Vercel production)**: auto-deploys on every push to `main`. The release tag itself triggers nothing — it's just for changelog/history.

**What about the old `dev → main` promote PR?**
Gone. The old `auto-promote.yml` is removed. Features go straight from their branch into `main` one PR at a time; the `dev → main` aggregate PR is no longer part of the flow.
