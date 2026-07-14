import { test, expect } from "@playwright/test";
import { createRetroBoard, joinRetroBoard, addCard } from "./retro-helpers";

test("facilitator creates a board, sees the default template columns, and adds a card", async ({ page }) => {
  await createRetroBoard(page, "Sprint 42 Retro");
  await expect(page.locator("[data-testid='retro-column']").filter({ hasText: "Mad" })).toBeVisible();
  await expect(page.locator("[data-testid='retro-column']").filter({ hasText: "Sad" })).toBeVisible();
  await expect(page.locator("[data-testid='retro-column']").filter({ hasText: "Glad" })).toBeVisible();

  await addCard(page, "Glad", "Shipped the retro board");
});

test("two participants see each other's cards and votes live", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  const boardUrl = await createRetroBoard(alice, "Pair retro", "Alice");
  await joinRetroBoard(bob, boardUrl, "Bob");

  await expect(alice.getByTestId("retro-participant").filter({ hasText: "B" })).toBeVisible({ timeout: 10_000 });
  await expect(bob.getByTestId("retro-participant").filter({ hasText: "A" })).toBeVisible({ timeout: 10_000 });

  await addCard(alice, "Mad", "Flaky CI");
  await expect(bob.getByTestId("retro-card").filter({ hasText: "Flaky CI" })).toBeVisible({ timeout: 10_000 });

  // Bob votes on Alice's card from his own client.
  const bobCard = bob.getByTestId("retro-card").filter({ hasText: "Flaky CI" });
  await bobCard.getByTestId("retro-card-vote").click();
  await expect(bobCard.getByTestId("retro-card-vote")).toHaveText(/1/, { timeout: 10_000 });

  // Alice's copy of the same card reflects the vote too.
  const aliceCard = alice.getByTestId("retro-card").filter({ hasText: "Flaky CI" });
  await expect(aliceCard.getByTestId("retro-card-vote")).toHaveText(/1/, { timeout: 10_000 });

  await aliceCtx.close();
  await bobCtx.close();
});

test("vote budget is enforced across all cards", async ({ page }) => {
  await createRetroBoard(page, "Budget retro");

  // Default budget is 5 — lower it to 2 via settings so the test is fast.
  await page.getByTitle("Board settings").click();
  const maxVotesInput = page.getByTestId("retro-max-votes-input");
  await maxVotesInput.fill("2");
  await page.getByRole("button", { name: /^save$/i }).click();
  await expect(page.getByText(/votes left:\s*2\s*\/\s*2/i)).toBeVisible({ timeout: 10_000 });

  await addCard(page, "Mad", "Card one");
  await addCard(page, "Mad", "Card two");
  await addCard(page, "Mad", "Card three");

  const cardOne = page.getByTestId("retro-card").filter({ hasText: "Card one" });
  const cardTwo = page.getByTestId("retro-card").filter({ hasText: "Card two" });
  const cardThree = page.getByTestId("retro-card").filter({ hasText: "Card three" });

  await cardOne.getByTestId("retro-card-vote").click();
  await expect(page.getByText(/votes left:\s*1\s*\/\s*2/i)).toBeVisible({ timeout: 10_000 });
  await cardTwo.getByTestId("retro-card-vote").click();
  await expect(page.getByText(/votes left:\s*0\s*\/\s*2/i)).toBeVisible({ timeout: 10_000 });

  // A third vote is refused — the button is disabled once the budget is spent.
  await expect(cardThree.getByTestId("retro-card-vote")).toBeDisabled();

  // Un-voting frees up the budget again.
  await cardOne.getByTestId("retro-card-vote").click();
  await expect(page.getByText(/votes left:\s*1\s*\/\s*2/i)).toBeVisible({ timeout: 10_000 });
});

test("author can edit and delete their own card", async ({ page }) => {
  await createRetroBoard(page, "Edit retro");
  await addCard(page, "Sad", "Original text");

  const card = page.getByTestId("retro-card").filter({ hasText: "Original text" });
  const cardId = await card.getAttribute("data-card-id");
  const stableCard = page.locator(`[data-testid='retro-card'][data-card-id='${cardId}']`);
  await stableCard.getByTestId("retro-card-edit").click();
  await stableCard.locator("textarea").fill("Edited text");
  await stableCard.getByRole("button", { name: /^save$/i }).click();
  await expect(page.getByTestId("retro-card").filter({ hasText: "Edited text" })).toBeVisible({ timeout: 10_000 });

  await page.getByTestId("retro-card").filter({ hasText: "Edited text" }).getByTestId("retro-card-delete").click();
  await expect(page.getByTestId("retro-card")).toHaveCount(0);
});

test("anonymous mode hides the author name for other participants", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  const boardUrl = await createRetroBoard(alice, "Anon retro", "Alice");
  await joinRetroBoard(bob, boardUrl, "Bob");

  await addCard(alice, "Glad", "A candid note");
  await expect(bob.getByTestId("retro-card").filter({ hasText: "A candid note" })).toBeVisible({ timeout: 10_000 });
  await expect(bob.getByTestId("retro-card").filter({ hasText: "A candid note" }).getByText("Alice")).toBeVisible();

  await alice.getByTitle("Board settings").click();
  await alice.getByTestId("retro-anonymous-toggle").click();
  await alice.getByRole("button", { name: /^save$/i }).click();

  const bobCard = bob.getByTestId("retro-card").filter({ hasText: "A candid note" });
  await expect(bobCard.getByText("Anonymous")).toBeVisible({ timeout: 10_000 });
  await expect(bobCard.getByText("Alice")).toHaveCount(0);

  // Alice still sees her own name on her own card.
  const aliceCard = alice.getByTestId("retro-card").filter({ hasText: "A candid note" });
  await expect(aliceCard.getByText("Alice")).toBeVisible();

  await aliceCtx.close();
  await bobCtx.close();
});

test("facilitator can start, pause, and reset the timer", async ({ page }) => {
  await createRetroBoard(page, "Timer retro");

  await page.getByTestId("retro-timer-start").click();
  await page.getByTestId("retro-timer-preset").first().click();
  await expect(page.getByTestId("retro-timer-display")).toBeVisible({ timeout: 10_000 });

  await page.getByTestId("retro-timer-pause").click();
  await expect(page.getByTestId("retro-timer-resume")).toBeVisible();

  await page.getByTestId("retro-timer-reset").click();
  await expect(page.getByTestId("retro-timer-start")).toBeVisible({ timeout: 10_000 });
});

test("facilitator kicks a participant, who lands on the removed overlay", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  const boardUrl = await createRetroBoard(alice, "Kick retro", "Alice");
  await joinRetroBoard(bob, boardUrl, "Bob");
  await expect(alice.getByTestId("retro-participant").filter({ hasText: "B" })).toBeVisible({ timeout: 10_000 });

  const bobAvatar = alice.getByTestId("retro-participant").filter({ hasText: "B" });
  await bobAvatar.hover();
  await bobAvatar.getByTestId("retro-kick-button").click();
  await alice.getByRole("button", { name: /^remove$/i }).click();

  const overlay = bob.getByTestId("retro-inactive-overlay");
  await expect(overlay).toBeVisible({ timeout: 10_000 });
  await expect(overlay).toHaveAttribute("data-reason", "kicked");

  await aliceCtx.close();
  await bobCtx.close();
});

test("facilitator closes the board, disconnecting all participants", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  const boardUrl = await createRetroBoard(alice, "Close retro", "Alice");
  await joinRetroBoard(bob, boardUrl, "Bob");
  await expect(alice.getByTestId("retro-participant").filter({ hasText: "B" })).toBeVisible({ timeout: 10_000 });

  await alice.getByRole("button", { name: /alice/i }).first().click();
  await alice.getByText(/close board for everyone/i).click();
  await alice.getByRole("button", { name: /close board/i }).click();

  const overlay = bob.getByTestId("retro-inactive-overlay");
  await expect(overlay).toBeVisible({ timeout: 10_000 });
  await expect(overlay).toHaveAttribute("data-reason", "closed");

  await aliceCtx.close();
  await bobCtx.close();
});

test("visiting an unknown board id shows the not-found overlay", async ({ page }) => {
  await page.goto("/retro/does-not-exist");
  await page.getByPlaceholder("Alice").fill("Nobody");
  await page.getByRole("button", { name: /continue to board/i }).click();

  const overlay = page.getByTestId("retro-inactive-overlay");
  await expect(overlay).toBeVisible({ timeout: 10_000 });
  await expect(overlay).toHaveAttribute("data-reason", "not_found");
});
