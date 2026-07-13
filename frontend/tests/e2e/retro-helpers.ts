import { Page, expect } from "@playwright/test";

async function waitForWsOpen(page: Page): Promise<void> {
  await expect(page.locator(".bg-green-500").first()).toBeVisible({ timeout: 10_000 });
}

/**
 * Create a retro board from `/retro/new`, complete the display-name dialog,
 * and wait for the board screen to finish connecting. Mirrors
 * `helpers.ts:createRoom` for Planning Poker.
 */
export async function createRetroBoard(page: Page, boardName = "Sprint 42 Retro",
                                       facilitatorNick = "Alice"): Promise<string> {
  await page.goto("/retro/new");
  await page.getByPlaceholder("Sprint 42 Retro").fill(boardName);
  await page.getByRole("button", { name: /create board/i }).click();
  // Excludes "new" so this doesn't false-match the page we're already on.
  await page.waitForURL(/\/retro\/(?!new$)[a-z0-9]+$/);
  const url = page.url();
  await page.getByPlaceholder("Alice").fill(facilitatorNick);
  await page.getByRole("button", { name: /continue to board/i }).click();
  await expect(page.getByPlaceholder("Alice")).toHaveCount(0);
  await waitForWsOpen(page);
  return url;
}

/** Join an existing retro board URL in a fresh context. */
export async function joinRetroBoard(page: Page, boardUrl: string, nickname: string): Promise<void> {
  await page.goto(boardUrl);
  await page.getByPlaceholder("Alice").fill(nickname);
  await page.getByRole("button", { name: /continue to board/i }).click();
  await expect(page.getByPlaceholder("Alice")).toHaveCount(0);
  await waitForWsOpen(page);
}

/** Add a card to a column by its title (e.g. "Mad", "Glad", "Start"). */
export async function addCard(page: Page, columnTitle: string, text: string): Promise<void> {
  const column = page.locator("[data-testid='retro-column']").filter({ hasText: columnTitle }).first();
  const input = column.getByTestId("retro-add-card-input");
  await input.fill(text);
  await input.press("Enter");
  await expect(column.getByTestId("retro-card").filter({ hasText: text })).toBeVisible({ timeout: 10_000 });
}

/**
 * Drag `sourceText`'s card onto `targetText`'s card via real mouse input
 * (Playwright's `page.mouse` drives genuine pointer events, unlike a
 * scripted `dispatchEvent`, so this exercises the same `onPointerDown` /
 * `setPointerCapture` path a real user's drag would — issue #62 Phase 2
 * groups cards this way instead of native HTML5 drag-and-drop, which
 * doesn't fire on touch devices).
 */
export async function dragCardOnto(page: Page, sourceText: string, targetText: string): Promise<void> {
  const sourceCard = page.getByTestId("retro-card").filter({ hasText: sourceText }).first();
  const targetCard = page.getByTestId("retro-card").filter({ hasText: targetText }).first();
  const grip = sourceCard.getByTestId("retro-card-grip");

  const gripBox = await grip.boundingBox();
  const targetBox = await targetCard.boundingBox();
  if (!gripBox || !targetBox) throw new Error("Could not measure drag source/target");

  await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 5 });
  await page.mouse.up();
}
