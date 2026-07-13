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
  await bobCard.hover();
  await bobCard.getByTestId("retro-card-reaction-button").first().click();

  const aliceCard = alice.getByTestId("retro-card").filter({ hasText: "Flaky CI" });
  await expect(aliceCard.getByTestId("retro-card-reaction-overlay")).toBeVisible({ timeout: 10_000 });
  await expect(bobCard.getByTestId("retro-card-reaction-overlay")).toBeVisible({ timeout: 10_000 });

  await aliceCtx.close();
  await bobCtx.close();
});

test.describe("mobile viewport", () => {
  test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

  test("grip and reaction trigger are visible without hover, vote still works via tap", async ({ page }) => {
    await createRetroBoard(page, "Mobile retro test");
    await addCard(page, "Mad", "Touch card");

    const card = page.getByTestId("retro-card").filter({ hasText: "Touch card" });
    // No `:hover` state on a touchscreen — both controls default to visible
    // (issue #23 convention: opacity-100 unless a real pointer is present).
    await expect(card.getByTestId("retro-card-grip")).toBeVisible();
    await expect(card.getByTestId("retro-card-reaction-bar")).toBeVisible();

    await card.getByTestId("retro-card-vote").tap();
    await expect(card.getByTestId("retro-card-vote")).toHaveText(/1/, { timeout: 10_000 });
  });
});
