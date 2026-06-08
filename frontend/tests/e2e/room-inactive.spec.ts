import { test, expect } from "@playwright/test";

/**
 * Issue #2 — Visiting a room URL that doesn't exist (already closed, timer
 * expired, or never created) shows the "no longer active" overlay instead of
 * a broken loading screen / endless reconnect loop.
 *
 * We can't easily race the 24h timer in an e2e test, but we can verify the
 * UX path for any dead URL — the cleanup task removes expired rooms from the
 * store, so the user experience is identical in both cases (the WS endpoint
 * returns close code 4004 once the room is gone).
 */
test("visiting a non-existent room URL shows the inactive overlay", async ({ page }) => {
  // A room id that was never created. Backend returns 404 on REST and 4004
  // on the WS handshake.
  await page.goto("/room/does-not-exist");

  // The Join screen still asks for a nickname (the room page doesn't know
  // it's dead until the WS handshake closes). Fill it in.
  await page.getByPlaceholder("Alice").fill("Visitor");
  await page.getByRole("button", { name: /continue to game/i }).click();

  // The hook receives close code 4004, sets roomInactive="not_found", and the
  // page renders the overlay.
  const overlay = page.getByTestId("room-inactive-overlay");
  await expect(overlay).toBeVisible({ timeout: 10_000 });
  await expect(overlay).toHaveAttribute("data-reason", "not_found");

  // Friendly headline and a button back to the home page.
  await expect(overlay.getByRole("heading", { name: /room not found/i })).toBeVisible();
  await overlay.getByRole("button", { name: /back to home/i }).click();
  await page.waitForURL("/", { timeout: 5_000 });
});
