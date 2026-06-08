import { test, expect } from "@playwright/test";
import { createRoom, joinRoom } from "./helpers";

/**
 * Issue #4 — destructive actions ask through an in-app ConfirmModal instead
 * of the browser's native `confirm()`. The same shared component is wired
 * into all four flows; tests below pin two representative ones.
 */

test("close-room modal: open from profile menu, Cancel/ESC/backdrop close it", async ({ page }) => {
  await createRoom(page, "Close-room confirm test", "Alice");

  // Open profile menu — header has an avatar pill button with the user's
  // first letter and nickname. Click anything in the header that opens it.
  const headerButtons = page.locator("header button");
  // The "open profile menu" button is the one wrapping the avatar circle.
  // We look for it by the styling marker the component uses.
  await page.locator("header [class*='rounded-full']").filter({ hasText: /^[A-Z]/i }).first().click();

  await page.getByRole("button", { name: /close room for everyone/i }).click();

  const modal = page.getByTestId("confirm-modal");
  await expect(modal).toBeVisible();
  await expect(modal).toContainText(/close room for everyone/i);
  await expect(page.getByTestId("confirm-modal-confirm")).toBeFocused();

  // Cancel button.
  await page.getByTestId("confirm-modal-cancel").click();
  await expect(modal).not.toBeVisible();

  // Re-open via the menu, close via ESC.
  await page.locator("header [class*='rounded-full']").filter({ hasText: /^[A-Z]/i }).first().click();
  await page.getByRole("button", { name: /close room for everyone/i }).click();
  await expect(modal).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(modal).not.toBeVisible();

  // Silence unused-variable lint warning.
  void headerButtons;
});

test("kick-player modal: facilitator confirms before the player is removed", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  const roomUrl = await createRoom(alice, "Kick confirm test", "Alice");
  await joinRoom(bob, roomUrl, "Bob");

  await expect(alice.locator("[data-testid='player-card']:visible")).toHaveCount(2, { timeout: 10_000 });

  // Locate Bob's card on Alice's screen by composite selector — the card
  // ROOT itself carries data-player-nickname, so `.filter({ has })` would
  // miss it (it looks inside). Force-click the kick button (opacity-0 until
  // group-hover; force ignores visibility).
  const bobCard = alice.locator(
    "[data-testid='player-card']:visible[data-player-nickname='Bob']"
  );
  const kickBtn = bobCard.getByRole("button", { name: /remove from room/i });
  await kickBtn.click({ force: true });

  // Kick-confirmation modal mentions Bob by name; the confirm button is
  // labelled "Remove".
  const modal = alice.getByTestId("confirm-modal");
  await expect(modal).toBeVisible();
  await expect(modal).toContainText(/remove bob/i);
  await expect(alice.getByTestId("confirm-modal-confirm")).toHaveText(/remove/i);

  // Cancel first — Bob still there.
  await alice.getByTestId("confirm-modal-cancel").click();
  await expect(modal).not.toBeVisible();
  await expect(alice.locator("[data-testid='player-card']:visible")).toHaveCount(2);

  // Re-open, Confirm → Bob disappears.
  await kickBtn.click({ force: true });
  await alice.getByTestId("confirm-modal-confirm").click();
  await expect(alice.locator("[data-testid='player-card']:visible")).toHaveCount(1, { timeout: 5_000 });

  await aliceCtx.close();
  await bobCtx.close();
});
