import { test, expect } from "@playwright/test";
import { createRetroBoard, joinRetroBoard } from "./retro-helpers";

/**
 * Issue #68 — header quick-reactions panel for Retro Board. Emoji-only
 * clone of Planning Poker's ReactionsPanel (issue #32) — no time-value
 * mode, since that's specific to Planning Poker's capacity gut-check.
 *
 * The server broadcasts every `reaction` message to ALL connected
 * participants (sender included), and the only visible effect is a rising
 * floater in the lower-left — no on-card overlay, since Retro Board has no
 * PlayerCard equivalent to anchor one to.
 */
test("alice clicks an emoji in the header and both alice and bob see a floater", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  const boardUrl = await createRetroBoard(alice, "Reactions retro", "Alice");
  await joinRetroBoard(bob, boardUrl, "Bob");

  await alice
    .getByTestId("retro-reactions-panel")
    .locator("[data-reaction-value='🎉']")
    .click();

  await expect(alice.getByTestId("reaction-floater").first()).toBeVisible({ timeout: 3000 });
  const bobFloater = bob.getByTestId("reaction-floater").first();
  await expect(bobFloater).toBeVisible({ timeout: 3000 });
  await expect(bobFloater).toHaveAttribute("data-reaction-value", "🎉");

  await aliceCtx.close();
  await bobCtx.close();
});

test("throttle: second click within 600ms is dropped", async ({ page }) => {
  await createRetroBoard(page, "Throttle retro");
  const panel = page.getByTestId("retro-reactions-panel");

  await panel.locator("[data-reaction-value='🎉']").click();
  await expect(page.getByTestId("reaction-floater").first()).toBeVisible({ timeout: 3000 });

  const before = await page.getByTestId("reaction-floater").count();
  await panel.locator("[data-reaction-value='👍']").click();
  await page.waitForTimeout(200);
  const after = await page.getByTestId("reaction-floater").count();
  expect(after).toBe(before);
});

test("Retro Board's reactions panel is emoji-only — no time-value mode toggle", async ({ page }) => {
  await createRetroBoard(page, "No mode toggle retro");
  const panel = page.getByTestId("retro-reactions-panel");

  await expect(panel).toBeVisible();
  await expect(page.getByTestId("reactions-mode-number")).toHaveCount(0);
  await expect(panel.locator("[data-reaction-value='1h']")).toHaveCount(0);
  await expect(panel.locator("[data-reaction-value='3d']")).toHaveCount(0);
});
