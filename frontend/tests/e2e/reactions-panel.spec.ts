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

test("throttle: second click within 1s is dropped", async ({ page }) => {
  await createRoom(page, "Throttle test", "Alice");
  const myCard = page.locator(
    "[data-testid='player-card']:visible[data-player-nickname='Alice']"
  );
  const panel = page.getByTestId("reactions-panel");

  await panel.locator("[data-reaction-value='👍']").click();
  await expect(myCard.getByTestId("reaction-overlay")).toBeVisible({ timeout: 3000 });

  // Quickly click a different emoji — should be throttled, overlay stays 👍.
  await panel.locator("[data-reaction-value='❤'], [data-reaction-value='💖']").first().click();
  // Give the WS a beat to do nothing.
  await page.waitForTimeout(200);
  await expect(myCard.getByTestId("reaction-overlay")).toHaveAttribute("data-reaction-value", "👍");
});
