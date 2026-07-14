import { test, expect } from "@playwright/test";
import { createRetroBoard, joinRetroBoard, addCard, dragCardOnto } from "./retro-helpers";

test("dragging one card onto another groups them into a stack", async ({ page }) => {
  await createRetroBoard(page, "Group retro");
  await addCard(page, "Mad", "Too many meetings");
  await addCard(page, "Mad", "Meetings run long");

  await dragCardOnto(page, "Too many meetings", "Meetings run long");

  const targetCard = page.getByTestId("retro-card").filter({ hasText: "Meetings run long" });
  await expect(targetCard.getByTestId("retro-card-group-badge")).toHaveText(/2/, { timeout: 10_000 });

  const sourceCard = page.getByTestId("retro-card").filter({ hasText: "Too many meetings" });
  await expect(sourceCard).toHaveAttribute("data-group-id", await targetCard.getAttribute("data-card-id") as string);
});

test("dragging onto a card in a different column does not group them", async ({ page }) => {
  await createRetroBoard(page, "Cross-column retro");
  await addCard(page, "Mad", "Card A");
  await addCard(page, "Sad", "Card B");

  await dragCardOnto(page, "Card A", "Card B");

  // No group badge appears anywhere — the client rejects cross-column drops
  // before ever sending a WS message.
  await page.waitForTimeout(300);
  await expect(page.getByTestId("retro-card-group-badge")).toHaveCount(0);
  const cardA = page.getByTestId("retro-card").filter({ hasText: "Card A" });
  await expect(cardA).toHaveAttribute("data-group-id", "");
});

test("ungrouping a child detaches it while the rest of the stack stays intact", async ({ page }) => {
  await createRetroBoard(page, "Ungroup retro");
  await addCard(page, "Glad", "One");
  await addCard(page, "Glad", "Two");
  await addCard(page, "Glad", "Three");

  const head = page.getByTestId("retro-card").filter({ hasText: "Three" });

  await dragCardOnto(page, "One", "Three");
  // Wait for the first grouping's board_state round-trip to land and the
  // stack to re-render before measuring positions for the second drag —
  // otherwise the second drop can land on stale (pre-reflow) coordinates.
  await expect(head.getByTestId("retro-card-group-badge")).toHaveText(/2/, { timeout: 10_000 });

  await dragCardOnto(page, "Two", "Three");
  await expect(head.getByTestId("retro-card-group-badge")).toHaveText(/3/, { timeout: 10_000 });

  const childOne = page.getByTestId("retro-card").filter({ hasText: "One" });
  await childOne.hover();
  await childOne.getByTestId("retro-card-ungroup").click();

  await expect(head.getByTestId("retro-card-group-badge")).toHaveText(/2/, { timeout: 10_000 });
  await expect(childOne).toHaveAttribute("data-group-id", "");
});

test("dragging an already-grouped child moves only that card, not its whole former stack", async ({ page }) => {
  // Regression: dragging a child used to resolve to its OLD head and carry
  // the whole former stack along, even though only one card was grabbed.
  await createRetroBoard(page, "Child drag retro");
  await addCard(page, "Mad", "Head card");
  await addCard(page, "Mad", "Child card");
  await addCard(page, "Mad", "Target card");

  await dragCardOnto(page, "Child card", "Head card"); // stack: Head <- Child
  const headCard = page.getByTestId("retro-card").filter({ hasText: "Head card" });
  await expect(headCard.getByTestId("retro-card-group-badge")).toHaveText(/2/, { timeout: 10_000 });

  await dragCardOnto(page, "Child card", "Target card"); // drag the CHILD onto Target

  const targetCard = page.getByTestId("retro-card").filter({ hasText: "Target card" });
  await expect(targetCard.getByTestId("retro-card-group-badge")).toHaveText(/2/, { timeout: 10_000 });
  // The former head is left standalone — no longer showing a group badge.
  await expect(headCard.getByTestId("retro-card-group-badge")).toHaveCount(0);
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
