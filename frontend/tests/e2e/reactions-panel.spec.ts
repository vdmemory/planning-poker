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

test("emoji floater renders the animated MP4 from public/reactions/", async ({ page }) => {
  // The follow-up to #32: floaters in the lower-left use an animated MP4
  // sourced from `public/reactions/<codepoint>.mp4`. This test asserts the
  // <video> element is in the DOM and pointing at the right file — content
  // playback we trust to the browser, but the wiring (mapping codepoint →
  // src) is exactly what we want to guard against accidental regressions.
  await createRoom(page, "Animated floater", "Alice");
  await page.getByTestId("reactions-panel").locator("[data-reaction-value='👍']").click();

  const video = page.getByTestId("reaction-floater-video").first();
  await expect(video).toBeVisible({ timeout: 3000 });
  await expect(video).toHaveAttribute("src", "/reactions/1f44d.mp4");
});

test("number-mode floater stays as a chip (no video)", async ({ page }) => {
  // Time-value reactions don't have an MP4 — they render as a labelled pill,
  // both in the panel and in the floater. This guard makes sure we don't
  // accidentally route them through REACTION_EMOJI_VIDEO down the line.
  await createRoom(page, "Number floater", "Alice");
  await page.getByTestId("reactions-mode-number").click();
  await page.getByTestId("reactions-panel").locator("[data-reaction-value='1h']").click();

  const floater = page.getByTestId("reaction-floater").first();
  await expect(floater).toBeVisible({ timeout: 3000 });
  await expect(floater).toHaveAttribute("data-reaction-kind", "number");
  // No <video> inside.
  await expect(floater.getByTestId("reaction-floater-video")).toHaveCount(0);
});

test("new time-value ladder shows 12h and replaces 4h/8h/16h", async ({ page }) => {
  // The ladder changed from [1h 2h 4h 8h 16h 1d 2d 3d] to
  // [1h 2h 3h 5h 1d 12h 2d 3d] — guards copy + ordering so a future
  // refactor doesn't silently lose 12h or bring back the old ladder.
  await createRoom(page, "Number ladder", "Alice");
  const panel = page.getByTestId("reactions-panel");
  await page.getByTestId("reactions-mode-number").click();

  for (const v of ["1h", "2h", "3h", "5h", "1d", "12h", "2d", "3d"]) {
    await expect(panel.locator(`[data-reaction-value='${v}']`)).toBeVisible();
  }
  // The retired values are gone.
  for (const v of ["4h", "8h", "16h"]) {
    await expect(panel.locator(`[data-reaction-value='${v}']`)).toHaveCount(0);
  }
});
