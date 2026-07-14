import { test, expect } from "@playwright/test";
import { createRetroBoard, joinRetroBoard, addCard, dragCardOnto } from "./retro-helpers";

test("dragging one card onto another asks for confirmation, then merges them into one card with a divider", async ({ page }) => {
  await createRetroBoard(page, "Group retro");
  await addCard(page, "Mad", "Too many meetings");
  await addCard(page, "Mad", "Meetings run long");

  const source = page.getByTestId("retro-card").filter({ hasText: "Too many meetings" }).first();
  const target = page.getByTestId("retro-card").filter({ hasText: "Meetings run long" }).first();
  const grip = source.getByTestId("retro-card-grip");
  const gripBox = await grip.boundingBox();
  const targetBox = await target.boundingBox();
  if (!gripBox || !targetBox) throw new Error("Could not measure drag source/target");
  await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 5 });
  await page.mouse.up();

  // Confirmation dialog appears before anything merges.
  await expect(page.getByText(/merge these cards\?/i)).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("retro-card-group-badge")).toHaveCount(0);
  await page.getByRole("button", { name: /^merge$/i }).click();

  // Both texts now live in ONE card, separated by a divider.
  const merged = page.getByTestId("retro-card");
  await expect(merged).toHaveCount(1, { timeout: 10_000 });
  await expect(merged.getByTestId("retro-card-group-badge")).toHaveText(/2/);
  await expect(merged.getByTestId("retro-card-merged-block")).toHaveCount(2);
  await expect(merged.getByTestId("retro-card-merge-divider")).toHaveCount(1);
  await expect(merged.getByText("Too many meetings")).toBeVisible();
  await expect(merged.getByText("Meetings run long")).toBeVisible();
});

test("cancelling the merge confirmation leaves both cards separate", async ({ page }) => {
  await createRetroBoard(page, "Cancel merge retro");
  await addCard(page, "Mad", "Card A");
  await addCard(page, "Mad", "Card B");

  const source = page.getByTestId("retro-card").filter({ hasText: "Card A" }).first();
  const target = page.getByTestId("retro-card").filter({ hasText: "Card B" }).first();
  const grip = source.getByTestId("retro-card-grip");
  const gripBox = await grip.boundingBox();
  const targetBox = await target.boundingBox();
  if (!gripBox || !targetBox) throw new Error("Could not measure drag source/target");
  await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 5 });
  await page.mouse.up();

  await expect(page.getByText(/merge these cards\?/i)).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: /cancel/i }).click();

  await expect(page.getByTestId("retro-card")).toHaveCount(2);
  await expect(page.getByTestId("retro-card-group-badge")).toHaveCount(0);
});

test("dragging onto a card in a different column does not group them", async ({ page }) => {
  await createRetroBoard(page, "Cross-column retro");
  await addCard(page, "Mad", "Card A");
  await addCard(page, "Sad", "Card B");

  await dragCardOnto(page, "Card A", "Card B");

  // No confirmation, no merge — the client rejects cross-column drops
  // before ever sending a WS message.
  await expect(page.getByText(/merge these cards\?/i)).toHaveCount(0);
  await expect(page.getByTestId("retro-card")).toHaveCount(2);
  await expect(page.getByTestId("retro-card-group-badge")).toHaveCount(0);
});

test("adding a third card to an existing merge extends the same card", async ({ page }) => {
  await createRetroBoard(page, "Extend merge retro");
  await addCard(page, "Glad", "One");
  await addCard(page, "Glad", "Two");
  await addCard(page, "Glad", "Three");

  await dragCardOnto(page, "One", "Two");
  const merged = page.getByTestId("retro-card").filter({ hasText: "Two" });
  await expect(merged.getByTestId("retro-card-group-badge")).toHaveText(/2/, { timeout: 10_000 });

  // Drop a fresh standalone card onto the existing merged card.
  await dragCardOnto(page, "Three", "Two");
  await expect(merged.getByTestId("retro-card-group-badge")).toHaveText(/3/, { timeout: 10_000 });
  await expect(merged.getByTestId("retro-card-merged-block")).toHaveCount(3);
  await expect(page.getByTestId("retro-card")).toHaveCount(1);
});

test("the undo (unmerge) button splits a merged card back into separate standalone cards", async ({ page }) => {
  await createRetroBoard(page, "Unmerge retro");
  await addCard(page, "Glad", "One");
  await addCard(page, "Glad", "Two");
  await addCard(page, "Glad", "Three");

  await dragCardOnto(page, "One", "Three");
  await dragCardOnto(page, "Two", "Three");
  const merged = page.getByTestId("retro-card").filter({ hasText: "Three" });
  await expect(merged.getByTestId("retro-card-group-badge")).toHaveText(/3/, { timeout: 10_000 });

  await merged.getByTestId("retro-card-unmerge").click();

  await expect(page.getByTestId("retro-card")).toHaveCount(3, { timeout: 10_000 });
  await expect(page.getByTestId("retro-card-group-badge")).toHaveCount(0);
  await expect(page.getByText("One")).toBeVisible();
  await expect(page.getByText("Two")).toBeVisible();
  await expect(page.getByText("Three")).toBeVisible();
});

test("a vote cast before merging survives after unmerging", async ({ page }) => {
  // Regression guard for the "one shared vote" model: voting on a merged
  // card writes to a specific underlying card, and unmerge must not lose
  // that vote when the cards split back apart.
  await createRetroBoard(page, "Vote survives retro");
  await addCard(page, "Mad", "Alpha");
  await addCard(page, "Mad", "Beta");

  await dragCardOnto(page, "Alpha", "Beta");
  const merged = page.getByTestId("retro-card").filter({ hasText: "Beta" });
  await expect(merged.getByTestId("retro-card-group-badge")).toHaveText(/2/, { timeout: 10_000 });

  await merged.getByTestId("retro-card-vote").click();
  await expect(merged.getByTestId("retro-card-vote")).toHaveText(/1/, { timeout: 10_000 });

  await merged.getByTestId("retro-card-unmerge").click();
  await expect(page.getByTestId("retro-card")).toHaveCount(2, { timeout: 10_000 });

  const betaCard = page.getByTestId("retro-card").filter({ hasText: "Beta" });
  await expect(betaCard.getByTestId("retro-card-vote")).toHaveText(/1/);
  const alphaCard = page.getByTestId("retro-card").filter({ hasText: "Alpha" });
  await expect(alphaCard.getByTestId("retro-card-vote")).toHaveText(/0/);
});

test("dragging a merged card back onto itself is a no-op, not a crash", async ({ page }) => {
  // Regression: dropping a stack back onto one of its own underlying cards
  // sent group_cards for two cards already in the same group, which the
  // server rejects with RetroError("Cards are already in the same group").
  // Nothing filtered that client-side, so the error used to take over the
  // WHOLE page (RetroBoardPage renders full-screen for any `error`).
  await createRetroBoard(page, "Self-drag retro");
  await addCard(page, "Mad", "Head card");
  await addCard(page, "Mad", "Child card");

  await dragCardOnto(page, "Child card", "Head card");
  const merged = page.getByTestId("retro-card");
  await expect(merged.getByTestId("retro-card-group-badge")).toHaveText(/2/, { timeout: 10_000 });

  await dragCardOnto(page, "Head card", "Head card"); // dragging onto itself: same element, no-op
  await expect(page.getByText("Something went wrong")).toHaveCount(0);
  await expect(merged.getByTestId("retro-card-group-badge")).toHaveText(/2/);
});

test("reacting to a card shows an overlay on both clients", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  const boardUrl = await createRetroBoard(alice, "Reaction retro", "Alice");
  await joinRetroBoard(bob, boardUrl, "Bob");

  await addCard(alice, "Mad", "Flaky CI");
  await expect(bob.getByTestId("retro-card").filter({ hasText: "Flaky CI" })).toBeVisible({ timeout: 10_000 });

  const bobCard = bob.getByTestId("retro-card").filter({ hasText: "Flaky CI" });
  await bobCard.getByTestId("retro-card-reaction-trigger").click();
  await bobCard.getByTestId("retro-card-reaction-button").first().click();

  const aliceCard = alice.getByTestId("retro-card").filter({ hasText: "Flaky CI" });
  await expect(aliceCard.getByTestId("retro-card-reaction-overlay")).toBeVisible({ timeout: 10_000 });
  await expect(bobCard.getByTestId("retro-card-reaction-overlay")).toBeVisible({ timeout: 10_000 });

  await aliceCtx.close();
  await bobCtx.close();
});

test("reaction popover never overlaps the card's own text", async ({ page }) => {
  // Regression test: the reaction trigger used to be a hover-reveal overlay
  // positioned directly on top of the card, which covered the card's own
  // text on hover (and permanently on touch devices, which have no hover
  // state at all). Fixed by making it a click-triggered popover anchored to
  // a small button in the card's footer instead. `toBeVisible()` alone
  // wouldn't catch a geometric overlap (it doesn't check occlusion), so
  // this compares bounding boxes directly.
  await createRetroBoard(page, "Readability retro");
  await addCard(page, "Mad", "This text must stay readable");

  const card = page.getByTestId("retro-card").filter({ hasText: "This text must stay readable" });
  const text = card.getByText("This text must stay readable");

  await card.getByTestId("retro-card-reaction-trigger").click();
  const popover = card.getByTestId("retro-card-reaction-bar");
  await expect(popover).toBeVisible();

  const textBox = await text.boundingBox();
  const popoverBox = await popover.boundingBox();
  if (!textBox || !popoverBox) throw new Error("Could not measure text/popover");
  const overlaps =
    textBox.x < popoverBox.x + popoverBox.width &&
    textBox.x + textBox.width > popoverBox.x &&
    textBox.y < popoverBox.y + popoverBox.height &&
    textBox.y + textBox.height > popoverBox.y;
  expect(overlaps).toBe(false);

  // Clicking outside closes the popover.
  await page.mouse.click(700, 500);
  await expect(popover).toHaveCount(0);
});

test.describe("mobile viewport", () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

  test("grip and reaction trigger are visible without hover, vote and react still work via tap", async ({ page }) => {
    await createRetroBoard(page, "Mobile retro test");
    await addCard(page, "Mad", "Touch card");

    const card = page.getByTestId("retro-card").filter({ hasText: "Touch card" });
    // Both controls are always part of the card's own layout — no hover
    // state to reveal them, so there's nothing touch-specific to break here
    // (this replaced an earlier hover-reveal overlay that permanently
    // covered the card's text on touch devices, since they have no hover).
    await expect(card.getByTestId("retro-card-grip")).toBeVisible();
    await expect(card.getByTestId("retro-card-reaction-trigger")).toBeVisible();
    await expect(card.getByText("Touch card")).toBeVisible();

    await card.getByTestId("retro-card-vote").tap();
    await expect(card.getByTestId("retro-card-vote")).toHaveText(/1/, { timeout: 10_000 });

    await card.getByTestId("retro-card-reaction-trigger").tap();
    await card.getByTestId("retro-card-reaction-button").first().tap();
    await expect(card.getByTestId("retro-card-reaction-overlay")).toBeVisible({ timeout: 10_000 });
  });
});
