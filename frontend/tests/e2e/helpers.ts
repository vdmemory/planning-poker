import { Page, expect } from "@playwright/test";

/**
 * Wait until the WebSocket from `useRoomSocket` is OPEN by polling the connection
 * indicator dot in the header (green = connected, amber = reconnecting). The
 * client's `send()` silently drops messages until OPEN, so any action that goes
 * over WS (vote, reveal, settings…) needs to happen after this.
 */
async function waitForWsOpen(page: Page): Promise<void> {
  // The header has a small status dot: bg-green-500 when connected.
  await expect(page.locator(".bg-green-500").first()).toBeVisible({ timeout: 10_000 });
}

/**
 * Create a room from the room-creation page (`/new` — issue #22 moved the
 * form off `/`, which is now the marketing landing page), complete the
 * nickname dialog, and wait for the room screen to finish connecting.
 */
export async function createRoom(page: Page, gameName = "Sprint 42",
                                 facilitatorNick = "Alice"): Promise<string> {
  await page.goto("/new");
  await page.getByPlaceholder("Sprint 42 Planning").fill(gameName);
  await page.getByRole("button", { name: /create game/i }).click();
  await page.waitForURL(/\/room\/[a-z0-9]+/);
  const url = page.url();
  // Room screen asks for nickname again — fill it and join.
  await page.getByPlaceholder("Alice").fill(facilitatorNick);
  await page.getByRole("button", { name: /continue to game/i }).click();
  await expect(page.getByPlaceholder("Alice")).toHaveCount(0);
  await waitForWsOpen(page);
  return url;
}

/**
 * Join an existing room URL in a fresh context.
 */
export async function joinRoom(page: Page, roomUrl: string, nickname: string,
                               asSpectator = false): Promise<void> {
  await page.goto(roomUrl);
  await page.getByPlaceholder("Alice").fill(nickname);
  if (asSpectator) {
    await page.getByText(/join as spectator/i).click();
  }
  await page.getByRole("button", { name: /continue to game/i }).click();
  await expect(page.getByPlaceholder("Alice")).toHaveCount(0);
  await waitForWsOpen(page);
}

/**
 * Click a card until the vote registers on the server.
 *
 * Why polling: in dev, React Strict Mode mounts the WS hook twice, so the first
 * WS is opened-and-closed before the second establishes. A click during that gap
 * is silently dropped (`send()` checks `ws.readyState === OPEN`). Re-clicking
 * once WS is really open delivers the vote.
 *
 * `confirmText` is a Playwright text matcher that appears once the server has
 * recorded the vote and broadcast a new room_state. Default: "All voted!" —
 * works when the room has one active player. For multi-player, pass something
 * like /[1-9]\/\d+ voted/ to wait for the count to advance.
 */
export async function voteCard(page: Page, card: string,
                               confirmText: RegExp = /all voted/i): Promise<void> {
  const button = page.getByRole("button", { name: card, exact: true }).first();
  await expect(button).toBeVisible({ timeout: 10_000 });
  await expect.poll(async () => {
    await button.click();
    await page.waitForTimeout(400);
    return await page.getByText(confirmText).first().isVisible().catch(() => false);
  }, { timeout: 15_000, intervals: [500] }).toBe(true);
}
