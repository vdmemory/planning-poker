import { test, expect } from "@playwright/test";
import { createRoom, joinRoom } from "./helpers";

/**
 * Issue #37 — When the facilitator kicks a player via the ✕ button on
 * their card, the kicked player now lands on a dedicated "You were removed"
 * overlay (👋, "The facilitator removed you from this session…") instead of
 * silently bouncing to the home page. Same overlay infrastructure as
 * issues #2 (expired/not_found) and #19 (closed) — the union just gained
 * a fourth variant `roomInactive="kicked"`.
 *
 * The room stays alive for the facilitator after the kick (different from
 * `roomInactive="closed"` which tears the room down for everyone).
 */
test("facilitator kicks a player → kicked player sees the removed-from-room overlay", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  // Alice creates the room (facilitator), Bob joins.
  const roomUrl = await createRoom(alice, "Kick flow", "Alice");
  await joinRoom(bob, roomUrl, "Bob");

  // Both can see each other before the kick.
  await expect(alice.getByText("Bob").first()).toBeVisible({ timeout: 10_000 });
  await expect(bob.getByText("Alice").first()).toBeVisible({ timeout: 10_000 });

  // Alice hovers Bob's card to reveal the ✕ button. The kick button only
  // appears on group-hover (facilitator UI), so we use force-click on the
  // hover target — the button is in the DOM, just not visible until hover.
  const bobCard = alice.locator("[data-testid='player-card'][data-player-nickname='Bob']").first();
  await bobCard.hover();
  // The kick button is positioned `-top-2 -right-2` on the card. Its title
  // attribute is "Remove from room" — that's our stable selector.
  await alice.getByRole("button", { name: /remove from room/i }).click();

  // ConfirmModal (issue #4) gates the kick — confirm via its primary button.
  await expect(alice.getByText(/remove bob from the room/i)).toBeVisible();
  await alice.getByRole("button", { name: /^remove$/i }).click();

  // Bob lands on the kicked overlay. The reason="kicked" attribute is the
  // signal that we routed through the right branch (not closed / not expired).
  const overlay = bob.getByTestId("room-inactive-overlay");
  await expect(overlay).toBeVisible({ timeout: 10_000 });
  await expect(overlay).toHaveAttribute("data-reason", "kicked");
  await expect(
    overlay.getByRole("heading", { name: /you were removed from this room/i }),
  ).toBeVisible();
  await expect(overlay.getByText(/the facilitator removed you/i)).toBeVisible();

  // Alice's room is still alive — she's not on the overlay.
  await expect(alice.getByTestId("room-inactive-overlay")).toHaveCount(0);

  // Back-to-home button still works from the overlay.
  await overlay.getByRole("button", { name: /back to home/i }).click();
  await bob.waitForURL("/", { timeout: 5_000 });

  await aliceCtx.close();
  await bobCtx.close();
});
