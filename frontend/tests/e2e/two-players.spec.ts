import { test, expect } from "@playwright/test";
import { createRoom, joinRoom, voteCard } from "./helpers";

test("two players in the same room see each other vote and reveal together", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  // Alice creates the room (facilitator).
  const roomUrl = await createRoom(alice, "Pair test");

  // Bob joins via the same URL.
  await joinRoom(bob, roomUrl, "Bob");

  // Both see each other.
  await expect(alice.getByText("Bob").first()).toBeVisible({ timeout: 10_000 });
  await expect(bob.getByText("Alice").first()).toBeVisible({ timeout: 10_000 });

  // Both vote. After alice's vote, the count goes to 1/2; after bob's it
  // becomes "All voted!" on both pages.
  await voteCard(alice, "5", /1\/2/);
  await voteCard(bob, "8");

  // After both vote, alice (facilitator) sees Reveal cards.
  const reveal = alice.getByRole("button", { name: /reveal cards/i });
  await expect(reveal).toBeVisible({ timeout: 10_000 });
  await reveal.click();

  // Both clients receive the revealed state; Average = (5+8)/2 = 6.5.
  await expect(alice.getByText("Average").first()).toBeVisible({ timeout: 5_000 });
  await expect(bob.getByText("Average").first()).toBeVisible({ timeout: 5_000 });
  await expect(alice.getByText("6.5").first()).toBeVisible();
  await expect(bob.getByText("6.5").first()).toBeVisible();

  await aliceCtx.close();
  await bobCtx.close();
});
