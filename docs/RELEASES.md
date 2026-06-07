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
                                                 ┌─ release-please —┐
                                                 │                  │
feature → dev → PR(dev → main) → merge → main → push triggers ─ workflow ─ opens "release PR" ─ you review ─ merge release PR ─ tag v0.X.Y + GitHub Release
```

### Step-by-step

1. **Develop on a feature branch** branched from `dev`.
2. Commits MUST follow [Conventional Commits](https://www.conventionalcommits.org/). Format:
   ```
   feat: short summary in present tense

   Optional longer body explaining what and why.

   Closes #N
   ```
   Allowed types: `feat`, `fix`, `perf`, `refactor`, `docs`, `ci`, `test`, `chore`, `build`, `style`. See [the rules file](RULES.md#commit-conventions) for examples.
3. **Open PR to `dev`** → review → merge.
4. When ready for a release: open PR from `dev` to `main`. Merge after CI is green.
5. Release-please workflow (`.github/workflows/release-please.yml`) runs on the push to `main`:
   - Reads commits since the last release tag.
   - Computes the next version per Conventional Commits rules.
   - Updates `CHANGELOG.md` and `frontend/package.json`'s version field.
   - Updates `.release-please-manifest.json`.
   - Opens a **release PR** titled like `chore(main): release 0.2.0`.
6. **Review the release PR**:
   - Check the generated CHANGELOG section.
   - If anything is wrong (wrong category, missing item), close the PR, add a commit that fixes it, and the workflow will open a fresh release PR.
7. **Merge the release PR**. Release-please then:
   - Tags the merge commit `v0.2.0`.
   - Creates a GitHub Release with the changelog section as the body.

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
