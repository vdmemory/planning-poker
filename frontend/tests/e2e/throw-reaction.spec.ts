import { test, expect } from "@playwright/test";
import { createRoom, joinRoom } from "./helpers";

/**
 * Issue #51 — "throw a reaction at another player's card" hover panel.
 * Redo of the originally-shipped-as-a-dead-toggle "Enable fun features"
 * setting: it's now a real room-wide policy (`fun_features_enabled`,
 * facilitator-only, synced via `update_room`/`room_state` like
 * `who_can_reveal`) that gates a hover/tap bar on every other player's card:
 * default emoji (🎯✈️🧻❤️), a "+" for more, and — facilitator only — the
 * kick action that used to be a standalone corner "✕" (issue #23).
 */

async function enableFunReactions(page: import("@playwright/test").Page, gameName: string) {
  await page.getByRole("button", { name: gameName }).click();
  await page.getByTestId("fun-features-enabled-row").locator("button").click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: gameName })).toBeVisible(); // modal closed
}

test("emoji-throw portion is hidden until the facilitator enables it", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  const roomUrl = await createRoom(alice, "Fun toggle off", "Alice");
  await joinRoom(bob, roomUrl, "Bob");
  await expect(alice.getByText("Bob").first()).toBeVisible({ timeout: 10_000 });

  const bobCard = alice.locator("[data-testid='player-card'][data-player-nickname='Bob']").first();
  await bobCard.hover();

  // Facilitator still gets the kick action (moderation isn't gated)...
  await expect(alice.getByRole("button", { name: /remove from room/i })).toBeVisible();
  // ...but no emoji buttons before the room opts in.
  await expect(alice.getByTestId("throw-reaction-button")).toHaveCount(0);

  await aliceCtx.close();
  await bobCtx.close();
});

test("facilitator enables fun reactions, throws an emoji, both clients see it land", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  const roomUrl = await createRoom(alice, "Fun toggle on", "Alice");
  await joinRoom(bob, roomUrl, "Bob");
  await expect(alice.getByText("Bob").first()).toBeVisible({ timeout: 10_000 });

  await enableFunReactions(alice, "Fun toggle on");
  // Bob's room_state broadcast should reflect it too, no reload needed.
  await bob.waitForTimeout(300);

  const bobCardOnAlice = alice.locator("[data-testid='player-card'][data-player-nickname='Bob']").first();
  await bobCardOnAlice.hover();

  const dart = alice.locator('[data-testid="throw-reaction-button"][data-reaction-value="🎯"]');
  await expect(dart).toBeVisible();
  await dart.click();

  // Both the thrower's and the target's screens play the same animation.
  await expect(alice.getByTestId("throw-floater").first()).toBeVisible({ timeout: 2_000 });
  await expect(alice.getByTestId("throw-floater").first()).toHaveAttribute("data-reaction-value", "🎯");
  await expect(bob.getByTestId("throw-floater").first()).toBeVisible({ timeout: 2_000 });

  // It's ephemeral — gone well before the 1.5s lifetime elapses fully.
  await expect(alice.getByTestId("throw-floater")).toHaveCount(0, { timeout: 3_000 });

  await aliceCtx.close();
  await bobCtx.close();
});

test("the '+' picker throws an extended emoji and closes itself", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  const roomUrl = await createRoom(alice, "Fun toggle more", "Alice");
  await joinRoom(bob, roomUrl, "Bob");
  await expect(alice.getByText("Bob").first()).toBeVisible({ timeout: 10_000 });
  await enableFunReactions(alice, "Fun toggle more");

  const bobCard = alice.locator("[data-testid='player-card'][data-player-nickname='Bob']").first();
  await bobCard.hover();
  await alice.getByTestId("throw-reaction-more").click();

  const picker = alice.getByTestId("throw-reaction-picker");
  await expect(picker).toBeVisible();
  const tomato = picker.locator('[data-reaction-value="🍅"]');
  await tomato.click();

  await expect(alice.getByTestId("throw-floater").first()).toHaveAttribute("data-reaction-value", "🍅");
  await expect(picker).toBeHidden();
});

test("kicking a player still works from inside the new hover bar", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  const roomUrl = await createRoom(alice, "Fun toggle kick", "Alice");
  await joinRoom(bob, roomUrl, "Bob");
  await expect(alice.getByText("Bob").first()).toBeVisible({ timeout: 10_000 });
  await enableFunReactions(alice, "Fun toggle kick");

  const bobCard = alice.locator("[data-testid='player-card'][data-player-nickname='Bob']").first();
  await bobCard.hover();
  await alice.getByTestId("kick-player-button").click();
  await alice.getByRole("button", { name: /^remove$/i }).click();

  await expect(bob.getByTestId("room-inactive-overlay")).toBeVisible({ timeout: 10_000 });

  await aliceCtx.close();
  await bobCtx.close();
});
