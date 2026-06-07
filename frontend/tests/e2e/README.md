# Playwright e2e

Real browser tests against a real backend. Treats the app as a black box, exercising
the same flows a user would.

## Running

```bash
npm run test:e2e          # headless, fastest
npm run test:e2e:headed   # see the browser
npm run test:e2e:ui       # Playwright UI for debugging
```

The config (`playwright.config.ts`) starts a dedicated backend on `:8765` and a Vite
dev server on `:5174` — so tests don't clobber any local `npm run dev` session.

## What's covered

| File | Flow |
|---|---|
| `home.spec.ts` | Home page renders; create-room button blocks on empty input |
| `create-and-vote.spec.ts` | Create room → cast vote → see "you voted" indicator |
| `reveal-and-stats.spec.ts` | Vote → reveal cards → see average/consensus, then "New round" resets |
| `two-players.spec.ts` | Two browser contexts join the same room → both see each other's votes |

## What's not covered

- Drawing / live cursors (pure relays, no state change to verify)
- Mobile breakpoints (would need device-emulation projects; add later if needed)
- Visual diffs (no screenshot baselines yet)

See `docs/TESTING.md` for the bigger picture and the backend pytest suite.
