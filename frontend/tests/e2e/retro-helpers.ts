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
