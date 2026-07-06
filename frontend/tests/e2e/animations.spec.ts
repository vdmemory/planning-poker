import { test, expect } from "@playwright/test";
import { createRoom, joinRoom, voteCard } from "./helpers";

/**
 * Issue #5 — lightweight CSS-only UI animations (no framer-motion, no
 * animation library — see docs/BUSINESS_LOGIC.md's "not a business rule"
 * note in the PR that introduced these; this file just guards the classes
 * exist and are applied at the right moment, not exact animation timing).
 */

test("card flips when revealed", async ({ page }) => {
  await createRoom(page, "Animations test");
  await voteCard(page, "5");
  await page.getByRole("button", { name: /reveal/i }).click();

  const face = page.getByTestId("player-card-face").first();
  await expect(face).toHaveClass(/card-flip/);
  // The flip class is removed ~400ms after reveal — confirm it's temporary,
  // not a permanent class that would replay on every unrelated re-render.
  await expect(face).not.toHaveClass(/card-flip/, { timeout: 2_000 });
});

test("new player's card fades in", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  const roomUrl = await createRoom(alice, "Fade-in test", "Alice");
  await joinRoom(bob, roomUrl, "Bob");

  await expect(alice.locator("[data-testid='player-card']:visible")).toHaveCount(2, { timeout: 10_000 });
  const bobWrapper = alice
    .locator("[data-testid='player-card']:visible[data-player-nickname='Bob']")
    .locator("xpath=..");
  await expect(bobWrapper).toHaveClass(/player-fade-in/);

  await aliceCtx.close();
  await bobCtx.close();
});

test("kicked player's card fades out then disappears", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  const roomUrl = await createRoom(alice, "Fade-out test", "Alice");
  await joinRoom(bob, roomUrl, "Bob");
  await expect(alice.locator("[data-testid='player-card']:visible")).toHaveCount(2, { timeout: 10_000 });

  const bobCard = alice.locator("[data-testid='player-card']:visible[data-player-nickname='Bob']");
  await bobCard.getByRole("button", { name: /remove from room/i }).click({ force: true });
  await alice.getByTestId("confirm-modal-confirm").click();

  // Ghost renders immediately with the fade-out class...
  await expect(alice.getByTestId("player-card-ghost")).toBeVisible();
  // ...and is gone once the animation's had time to finish.
  await expect(alice.getByTestId("player-card-ghost")).toHaveCount(0, { timeout: 2_000 });
  await expect(alice.locator("[data-testid='player-card']:visible")).toHaveCount(1);

  await aliceCtx.close();
  await bobCtx.close();
});

test("stats panel slides in on reveal", async ({ page }) => {
  await createRoom(page, "Stats slide test");
  await voteCard(page, "8");
  await page.getByRole("button", { name: /reveal/i }).click();

  await expect(page.getByText("Average").locator("xpath=ancestor::div[contains(@class, 'stats-slide-in')]")).toBeVisible();
});

test("issue rows carry a stable data-issue-id for the reorder animation, and reorder still works", async ({ page }) => {
  await createRoom(page, "Reorder test");
  await page.getByTitle("Toggle issues sidebar").click();

  await page.getByRole("button", { name: /add another issue/i }).click();
  await page.getByPlaceholder("Enter a title for the issue").fill("First issue");
  await page.keyboard.press("Enter");

  await page.getByRole("button", { name: /add another issue/i }).click();
  await page.getByPlaceholder("Enter a title for the issue").fill("Second issue");
  await page.keyboard.press("Enter");

  const rows = page.locator("li[data-issue-id]");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("First issue");
  await expect(rows.nth(1)).toContainText("Second issue");

  // Move "Second issue" to the top via its per-row "···" menu.
  const secondRow = page.locator("li", { hasText: "Second issue" });
  await secondRow.getByRole("button", { name: "···" }).click();
  await page.getByRole("button", { name: /move to top/i }).click();

  await expect(rows.nth(0)).toContainText("Second issue");
  await expect(rows.nth(1)).toContainText("First issue");
});
