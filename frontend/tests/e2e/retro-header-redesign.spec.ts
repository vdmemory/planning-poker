import { test, expect } from "@playwright/test";
import { createRetroBoard, joinRetroBoard } from "./retro-helpers";

/**
 * Issue #62 follow-up — the board name button opens a full settings modal
 * (mirrors Planning Poker's GameSettingsModal) instead of the old inline
 * rename input, and a new profile avatar button opens RetroProfileMenu
 * (mirrors ProfileMenu) for nickname/avatar/theme/accent/leave. The old gear
 * button + anchored dropdown are gone.
 */

test("clicking the board name (facilitator) opens the settings modal and renames the board", async ({ page }) => {
  await createRetroBoard(page, "Old name", "Alice");

  await page.getByTitle("Board settings").click();
  const nameInput = page.locator("input[value='Old name']");
  await expect(nameInput).toBeVisible();
  await nameInput.fill("New name");
  await page.getByRole("button", { name: /^save$/i }).click();

  await expect(page.getByTitle("Board settings")).toHaveText("New name");
});

test("non-facilitator sees a plain board name with no settings button", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  const boardUrl = await createRetroBoard(alice, "Read-only name", "Alice");
  await joinRetroBoard(bob, boardUrl, "Bob");

  await expect(bob.getByText("Read-only name")).toBeVisible();
  await expect(bob.getByTitle("Board settings")).toHaveCount(0);

  await aliceCtx.close();
  await bobCtx.close();
});

test("profile avatar opens RetroProfileMenu and changes nickname live for other participants", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  const boardUrl = await createRetroBoard(alice, "Profile retro", "Alice");
  await joinRetroBoard(bob, boardUrl, "Bob");

  await alice.getByRole("button", { name: /alice/i }).first().click();
  await alice.getByRole("button", { name: /alice/i }).nth(1).click();
  const nameField = alice.locator("input").last();
  await nameField.fill("Alicia");
  await alice.getByRole("button", { name: /^save$/i }).click();

  await expect(bob.getByTestId("retro-participant").filter({ hasText: "A" })).toHaveAttribute(
    "title", /alicia/i, { timeout: 10_000 }
  );

  await aliceCtx.close();
  await bobCtx.close();
});

test("profile menu's leave/close action closes the board for the facilitator", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  const boardUrl = await createRetroBoard(alice, "Profile close retro", "Alice");
  await joinRetroBoard(bob, boardUrl, "Bob");

  await alice.getByRole("button", { name: /alice/i }).first().click();
  await alice.getByText(/close board for everyone/i).click();
  await alice.getByRole("button", { name: /close board/i }).click();

  const overlay = bob.getByTestId("retro-inactive-overlay");
  await expect(overlay).toBeVisible({ timeout: 10_000 });
  await expect(overlay).toHaveAttribute("data-reason", "closed");

  await aliceCtx.close();
  await bobCtx.close();
});

/**
 * Drawing toggle — same component (DrawingCanvas) as Planning Poker, just
 * wired into the retro board header now. Mirrors
 * drawing-toggle-and-fade.spec.ts's basic toggle assertions.
 */
test("pencil button toggles drawing mode on the retro board", async ({ page }) => {
  await createRetroBoard(page, "Retro drawing test", "Painter");

  const toggle = page.getByTestId("drawing-toggle");
  await expect(toggle).toHaveAttribute("data-active", "false");

  await toggle.click();
  await expect(toggle).toHaveAttribute("data-active", "true");

  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("data-active", "false");
});

test("a stroke drawn by one participant is relayed to another on the retro board", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  const boardUrl = await createRetroBoard(alice, "Retro draw relay", "Alice");
  await joinRetroBoard(bob, boardUrl, "Bob");

  await alice.getByTestId("drawing-toggle").click();
  const canvas = alice.getByTestId("drawing-canvas");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas has no bounding box");
  const startX = box.x + box.width * 0.4;
  const startY = box.y + box.height * 0.5;

  await alice.mouse.move(startX, startY);
  await alice.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await alice.mouse.move(startX + i * 12, startY + i * 4);
  }
  await alice.mouse.up();

  await expect(bob.getByTestId("drawing-canvas")).toHaveAttribute("data-stroke-count", /[1-9]/, { timeout: 10_000 });

  await aliceCtx.close();
  await bobCtx.close();
});
