import { test, expect } from "@playwright/test";
import { createRetroBoard, joinRetroBoard, addCard } from "./retro-helpers";

/**
 * Issue #65 — text comment thread on a retro card, opened from a
 * `retro-card-comment-trigger` button next to the vote button.
 */

test("adding a comment is visible to another participant, with a count badge", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  const boardUrl = await createRetroBoard(alice, "Comments retro", "Alice");
  await joinRetroBoard(bob, boardUrl, "Bob");

  await addCard(alice, "Mad", "Flaky CI");
  await expect(bob.getByTestId("retro-card").filter({ hasText: "Flaky CI" })).toBeVisible({ timeout: 10_000 });

  const aliceCard = alice.getByTestId("retro-card").filter({ hasText: "Flaky CI" });
  await aliceCard.getByTestId("retro-card-comment-trigger").click();
  await aliceCard.getByTestId("retro-card-comment-input").fill("Let's add retries");
  await aliceCard.getByTestId("retro-card-comment-input").press("Enter");

  await expect(aliceCard.getByTestId("retro-card-comment-count")).toHaveText("1");
  await expect(aliceCard.getByTestId("retro-card-comment")).toContainText("Let's add retries");

  const bobCard = bob.getByTestId("retro-card").filter({ hasText: "Flaky CI" });
  await expect(bobCard.getByTestId("retro-card-comment-count")).toHaveText("1", { timeout: 10_000 });
  await bobCard.getByTestId("retro-card-comment-trigger").click();
  await expect(bobCard.getByTestId("retro-card-comment")).toContainText("Let's add retries");
  await expect(bobCard.getByTestId("retro-card-comment")).toContainText("Alice");

  await aliceCtx.close();
  await bobCtx.close();
});

test("author can delete their own comment", async ({ page }) => {
  await createRetroBoard(page, "Delete own comment retro");
  await addCard(page, "Mad", "Card A");

  const card = page.getByTestId("retro-card").filter({ hasText: "Card A" });
  await card.getByTestId("retro-card-comment-trigger").click();
  await card.getByTestId("retro-card-comment-input").fill("temp comment");
  await card.getByTestId("retro-card-comment-input").press("Enter");
  await expect(card.getByTestId("retro-card-comment")).toBeVisible();

  await card.getByTestId("retro-card-comment-delete").click();
  await expect(card.getByTestId("retro-card-comment")).toHaveCount(0);
  await expect(card.getByTestId("retro-card-comment-count")).toHaveCount(0);
});

test("non-facilitator, non-author cannot delete another participant's comment", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const carolCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();
  const carol = await carolCtx.newPage();

  const boardUrl = await createRetroBoard(alice, "Permission retro", "Alice");
  await joinRetroBoard(bob, boardUrl, "Bob");
  await joinRetroBoard(carol, boardUrl, "Carol");

  await addCard(alice, "Mad", "Shared card");
  await expect(bob.getByTestId("retro-card").filter({ hasText: "Shared card" })).toBeVisible({ timeout: 10_000 });

  const bobCard = bob.getByTestId("retro-card").filter({ hasText: "Shared card" });
  await bobCard.getByTestId("retro-card-comment-trigger").click();
  await bobCard.getByTestId("retro-card-comment-input").fill("bob's comment");
  await bobCard.getByTestId("retro-card-comment-input").press("Enter");

  const carolCard = carol.getByTestId("retro-card").filter({ hasText: "Shared card" });
  await expect(carolCard.getByTestId("retro-card-comment-count")).toHaveText("1", { timeout: 10_000 });
  await carolCard.getByTestId("retro-card-comment-trigger").click();
  await expect(carolCard.getByTestId("retro-card-comment")).toContainText("bob's comment");
  await expect(carolCard.getByTestId("retro-card-comment-delete")).toHaveCount(0);

  // The facilitator (Alice), however, can delete anyone's comment.
  const aliceCard = alice.getByTestId("retro-card").filter({ hasText: "Shared card" });
  await expect(aliceCard.getByTestId("retro-card-comment-count")).toHaveText("1", { timeout: 10_000 });
  await aliceCard.getByTestId("retro-card-comment-trigger").click();
  await expect(aliceCard.getByTestId("retro-card-comment-delete")).toBeVisible();
  await aliceCard.getByTestId("retro-card-comment-delete").click();
  await expect(aliceCard.getByTestId("retro-card-comment")).toHaveCount(0);

  await aliceCtx.close();
  await bobCtx.close();
  await carolCtx.close();
});
