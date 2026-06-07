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

```
┌──────────────────────┐
│ feature → dev (PR)   │  squash merge → 1 conventional commit on dev
└──────────────────────┘
            ↓
┌──────────────────────┐
│ auto-promote workflow│  ensures a PR dev → main is open and up to date
└──────────────────────┘
            ↓
┌──────────────────────┐
│ dev → main (PR)      │  YOU review and merge with a regular MERGE COMMIT
└──────────────────────┘    (not squash — preserves individual feat: commits)
            ↓
┌──────────────────────┐
│ release-please       │  opens release PR with CHANGELOG and version bump
└──────────────────────┘
            ↓
┌──────────────────────┐
│ release PR           │  YOU review CHANGELOG and merge → tag + GitHub Release
└──────────────────────┘
```

### Step-by-step

1. **Develop on a feature branch** branched from `dev`.
2. Commits MUST follow [Conventional Commits](https://www.conventionalcommits.org/). Format:
   ```
   feat: short summary in present tense

   Optional longer body explaining what and why.

   Closes #N
   ```
   Allowed types: `feat`, `fix`, `perf`, `refactor`, `docs`, `ci`, `test`, `chore`, `build`, `style`. See [RULES.md rule 3](RULES.md) for examples.
3. **Open PR to `dev`** → review → **Squash and merge**. The squashed commit takes its message from the PR title — so the PR title MUST be a conventional commit (e.g. `feat: telegram login widget on home page`).
4. **Auto-promote workflow** (`.github/workflows/auto-promote.yml`) runs on the push to `dev`:
   - If a PR `dev → main` is already open — does nothing (the open PR auto-tracks new commits).
   - Otherwise — opens a new one titled `chore: promote dev to main`.
5. When you've accumulated enough features and want to ship them, **review and merge the `dev → main` PR**.
   - Use **Create a merge commit** in the merge dropdown — NOT squash. Squashing here would collapse all `feat:` commits inside into one PR title, and release-please would miss them.
   - The merge commit itself is non-conventional and release-please ignores it; the individual `feat:` / `fix:` commits inside are what matter.
6. **Release-please workflow** (`.github/workflows/release-please.yml`) runs on the push to `main`:
   - Reads commits since the last release tag.
   - Computes the next version per Conventional Commits rules.
   - Updates `CHANGELOG.md` and `frontend/package.json`'s version field.
   - Updates `.release-please-manifest.json`.
   - Opens a release PR titled like `chore(main): release 0.2.0`.
7. **Review the release PR**:
   - Check the generated CHANGELOG section.
   - If anything is wrong (wrong category, missing item), close the PR, add a commit that fixes it, and the workflow will open a fresh release PR.
8. **Merge the release PR** (squash is fine here — the release PR has exactly one bot-authored commit). Release-please then:
   - Tags the merge commit `v0.2.0`.
   - Creates a GitHub Release with the changelog section as the body.

### Why two layers (auto-promote + release-please)?

- **Auto-promote** answers "what's pending for the next release?" — the open `dev → main` PR is your queue.
- **Release-please** answers "what's in this release?" — the release PR is your finalized changelog.

Together they give you: never miss a PR you wanted to ship, always know what each version contains.

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

If this gets annoying, see RELEASES.md issue: switch to a fine-grained PAT (90-day rotation, scoped to this repo only with `contents:write` + `pull-requests:write` + `workflows:write`) and add it as the `token:` input to `release-please-action`.

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

**What if I forget to use a conventional prefix?**
The commit will be ignored by release-please. The change still ships, just won't appear in the CHANGELOG. You can amend the commit before merge or add a follow-up commit with the right prefix.

**What if a non-feat commit should actually trigger a release?**
Add `Release-As:` footer with the desired version to force a release.

**Does this auto-deploy?**
No. Tagging triggers nothing in our setup — Render + Vercel still deploy on push to `main` (which already happened before the release PR was merged). Tags are just for changelog/history.
