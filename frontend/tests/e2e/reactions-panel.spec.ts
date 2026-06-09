import { test, expect } from "@playwright/test";
import { createRoom, joinRoom } from "./helpers";

/**
 * Issue #32 — quick reactions panel.
 *
 * The server broadcasts every `reaction` message back to ALL connected
 * clients (sender included), and the frontend reacts in two visible ways:
 *   - a pop-in overlay above the sender's PlayerCard for ~3s
 *   - a rising floater in the lower-left, lasting ~3.5s
 *
 * We cover both pieces by having Alice react and asserting Bob sees them.
 */
test("alice clicks an emoji and bob sees an overlay on alice's card + a floater", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  const roomUrl = await createRoom(alice, "Reactions room", "Alice");
  await joinRoom(bob, roomUrl, "Bob");

  // Wait for both to see two PlayerCards (handshake done).
  const aliceCards = alice.locator("[data-testid='player-card']:visible");
  const bobCards = bob.locator("[data-testid='player-card']:visible");
  await expect(aliceCards).toHaveCount(2, { timeout: 10_000 });
  await expect(bobCards).toHaveCount(2, { timeout: 10_000 });

  // Alice fires a thumbs-up. She clicks the emoji button with value "👍".
  const aliceThumbsUp = alice
    .getByTestId("reactions-panel")
    .getByTestId("reaction-button")
    .filter({ has: alice.locator('[data-reaction-value="👍"]') })
    .first();
  // The data attribute is on the button itself, so we can also locate by attr:
  await alice
    .getByTestId("reactions-panel")
    .locator("[data-reaction-value='👍']")
    .first()
    .click();

  // 1. Alice's own card on Alice's screen shows the overlay (sender too).
  const aliceCardOnAlice = alice.locator(
    "[data-testid='player-card']:visible[data-player-nickname='Alice']"
  );
  await expect(
    aliceCardOnAlice.getByTestId("reaction-overlay")
  ).toBeVisible({ timeout: 3000 });

  // 2. Bob sees an overlay on Alice's card too (same broadcast).
  const aliceCardOnBob = bob.locator(
    "[data-testid='player-card']:visible[data-player-nickname='Alice']"
  );
  await expect(
    aliceCardOnBob.getByTestId("reaction-overlay")
  ).toBeVisible({ timeout: 3000 });
  await expect(
    aliceCardOnBob.getByTestId("reaction-overlay")
  ).toHaveAttribute("data-reaction-value", "👍");

  // 3. Both pages get a floater in the lower-left.
  await expect(alice.getByTestId("reaction-floater").first()).toBeVisible();
  await expect(bob.getByTestId("reaction-floater").first()).toBeVisible();

  // (Silences unused-locator lint warnings for the alternate spelling above.)
  void aliceThumbsUp;

  await aliceCtx.close();
  await bobCtx.close();
});

test("toggle to number mode shows time buttons (1h..3d)", async ({ page }) => {
  await createRoom(page, "Reactions mode test", "Alice");
  const panel = page.getByTestId("reactions-panel");

  // Initial mode is emoji — there's a 👍 button.
  await expect(panel.locator("[data-reaction-value='👍']")).toBeVisible();

  // Switch to number mode.
  await page.getByTestId("reactions-mode-number").click();
  await expect(panel.locator("[data-reaction-value='1h']")).toBeVisible();
  await expect(panel.locator("[data-reaction-value='3d']")).toBeVisible();

  // And the emoji button is gone in this mode.
  await expect(panel.locator("[data-reaction-value='👍']")).toHaveCount(0);
});

test("throttle: second click within 600ms is dropped", async ({ page }) => {
  await createRoom(page, "Throttle test", "Alice");
  const myCard = page.locator(
    "[data-testid='player-card']:visible[data-player-nickname='Alice']"
  );
  const panel = page.getByTestId("reactions-panel");

  await panel.locator("[data-reaction-value='👍']").click();
  await expect(myCard.getByTestId("reaction-overlay")).toBeVisible({ timeout: 3000 });

  // Quickly click a different emoji — should be throttled, overlay stays 👍.
  // The 200ms wait stays well inside the new 600ms throttle window, so the
  // second click is still expected to be dropped.
  await panel.locator("[data-reaction-value='💖']").first().click();
  await page.waitForTimeout(200);
  await expect(myCard.getByTestId("reaction-overlay")).toHaveAttribute("data-reaction-value", "👍");
});

test("emoji floater renders the Lottie animation from public/reactions-lottie/", async ({ page }) => {
  // Follow-up to #32: floaters in the lower-left now use a Lottie animation
  // sourced from `public/reactions-lottie/<codepoint>.json` (Google Noto
  // Animated Emoji). Lottie's transparent background fixes the white-square
  // problem the previous MP4 implementation had on the dark theme.
  // We assert the wrapper is in the DOM and points at the right JSON URL —
  // playback rendering we trust to lottie-web, but the codepoint mapping
  // is exactly what we want to guard against accidental regressions.
  await createRoom(page, "Animated floater", "Alice");
  await page.getByTestId("reactions-panel").locator("[data-reaction-value='👍']").click();

  const lottie = page.getByTestId("reaction-floater-lottie").first();
  await expect(lottie).toBeVisible({ timeout: 3000 });
  await expect(lottie).toHaveAttribute("data-lottie-url", "/reactions-lottie/1f44d.json");
});

test("number-mode floater stays as a chip (no Lottie)", async ({ page }) => {
  // Time-value reactions don't have a Lottie animation — they render as a
  // labelled pill, both in the panel and in the floater. This guard makes
  // sure we don't accidentally route them through REACTION_EMOJI_LOTTIE
  // down the line.
  await createRoom(page, "Number floater", "Alice");
  await page.getByTestId("reactions-mode-number").click();
  await page.getByTestId("reactions-panel").locator("[data-reaction-value='1h']").click();

  const floater = page.getByTestId("reaction-floater").first();
  await expect(floater).toBeVisible({ timeout: 3000 });
  await expect(floater).toHaveAttribute("data-reaction-kind", "number");
  // No Lottie wrapper inside.
  await expect(floater.getByTestId("reaction-floater-lottie")).toHaveCount(0);
});

test("time-value ladder covers 1h..6h hourly + 12h/1d/2d/3d", async ({ page }) => {
  // The ladder is [1h 2h 3h 4h 5h 6h 1d 12h 2d 3d]. Guards copy and the
  // hourly chunk so a future refactor doesn't silently drop 4h/6h or
  // bring back the old [8h 16h] members that we retired.
  await createRoom(page, "Number ladder", "Alice");
  const panel = page.getByTestId("reactions-panel");
  await page.getByTestId("reactions-mode-number").click();

  for (const v of ["1h", "2h", "3h", "4h", "5h", "6h", "1d", "12h", "2d", "3d"]) {
    await expect(panel.locator(`[data-reaction-value='${v}']`)).toBeVisible();
  }
  // Retired values stay gone.
  for (const v of ["8h", "16h"]) {
    await expect(panel.locator(`[data-reaction-value='${v}']`)).toHaveCount(0);
  }
});

test("party popper and fire reactions render their Lottie floaters", async ({ page }) => {
  // Sanity-check the two newest emojis are both wired to their Lottie
  // assets, not falling through to the text-glyph fallback.
  await createRoom(page, "New emojis", "Alice");
  const panel = page.getByTestId("reactions-panel");

  await panel.locator("[data-reaction-value='🎉']").click();
  let lottie = page.getByTestId("reaction-floater-lottie").first();
  await expect(lottie).toBeVisible({ timeout: 3000 });
  await expect(lottie).toHaveAttribute("data-lottie-url", "/reactions-lottie/1f389.json");

  // Wait past the throttle so the second click registers.
  await page.waitForTimeout(700);
  await panel.locator("[data-reaction-value='🔥']").click();
  // The newest floater appears at the end of the list.
  lottie = page.getByTestId("reaction-floater-lottie").last();
  await expect(lottie).toHaveAttribute("data-lottie-url", "/reactions-lottie/1f525.json");
});
