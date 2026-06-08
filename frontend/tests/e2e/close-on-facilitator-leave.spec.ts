import { test, expect } from "@playwright/test";
import { createRoom, joinRoom } from "./helpers";

/**
 * Issue #19 — When the facilitator (room creator) explicitly closes the room,
 * the participant gets the typed `room_closed` broadcast and lands on the
 * dedicated "no longer active" overlay (reason="closed") instead of being
 * bounced silently home or stuck on "Connecting…".
 *
 * Coverage note: the disconnect-cleanup path (`close_on_facilitator_leave`
 * toggle + 30s grace period) is fully exercised by the backend pytest suite —
 * we can't realistically race a 30-second timer in an e2e run, so we lean on
 * the unit tests there. Here we drive the user-visible UX of the broadcast
 * itself, which is the same payload both paths emit.
 */
test("facilitator closes the room → participant sees the closed-room overlay", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  // Alice creates the room (facilitator), Bob joins.
  const roomUrl = await createRoom(alice, "Close-room flow", "Alice");
  await joinRoom(bob, roomUrl, "Bob");

  // Both can see each other before the close.
  await expect(alice.getByText("Bob").first()).toBeVisible({ timeout: 10_000 });
  await expect(bob.getByText("Alice").first()).toBeVisible({ timeout: 10_000 });

  // Alice opens her profile menu and triggers the facilitator's close action.
  // The label says "Close room for everyone" (the regular-player variant says
  // "Leave room"). She then sees the ConfirmModal first (issue #4).
  await alice.getByRole("button", { name: /alice/i }).first().click();
  await alice.getByRole("button", { name: /close room for everyone/i }).click();
  // The ConfirmModal heading uses the same words; confirm via its primary
  // button which has the exact label "Close room".
  await expect(alice.getByRole("heading", { name: /close room for everyone/i })).toBeVisible();
  await alice.getByRole("button", { name: /^close room$/i }).click();

  // Bob lands on the inactive overlay with reason=closed. The creator-leaves
  // copy ("closed by the creator") is the differentiator from "expired" /
  // "not_found".
  const overlay = bob.getByTestId("room-inactive-overlay");
  await expect(overlay).toBeVisible({ timeout: 10_000 });
  await expect(overlay).toHaveAttribute("data-reason", "closed");
  await expect(overlay.getByRole("heading", { name: /closed by the creator/i })).toBeVisible();

  // And the way back home still works from the overlay.
  await overlay.getByRole("button", { name: /back to home/i }).click();
  await bob.waitForURL("/", { timeout: 5_000 });

  await aliceCtx.close();
  await bobCtx.close();
});

/**
 * Smoke check that the new toggle is rendered for the facilitator in the
 * settings modal — issue #19 introduces the opt-in. We don't try to verify the
 * disconnect-grace cleanup path itself here (covered by backend tests); this
 * just guards against the row disappearing in a future refactor.
 */
test("facilitator can see the close-on-leave toggle in settings", async ({ page }) => {
  await createRoom(page, "Settings toggle", "Alice");

  // Open settings via the game name in the header (facilitator-only button).
  await page.getByRole("button", { name: /settings toggle/i }).click();
  await expect(page.getByText(/game settings/i)).toBeVisible();

  // The new toggle row is visible.
  const row = page.getByTestId("close-on-facilitator-leave-row");
  await expect(row).toBeVisible();
  await expect(row.getByText(/close room when facilitator leaves/i)).toBeVisible();
});
