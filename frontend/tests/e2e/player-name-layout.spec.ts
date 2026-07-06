import { test, expect } from "@playwright/test";
import { createRoom, joinRoom } from "./helpers";

/**
 * Issue #7: nickname is shown in a colored pill under the card (the
 * letter-avatar circle it replaced used to sit above the card). A later
 * pass moved the pill from above the card to under it, and dropped the
 * "host" badge that used to sit next to the facilitator's card.
 *
 * `PokerTable` is one component across all breakpoints (see
 * `docs/BUSINESS_LOGIC.md`), so there's only ever one PlayerCard per player
 * in the DOM — no duplicate mobile/desktop copies to filter out here.
 */
test("player nickname renders as a pill under the card", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  const roomUrl = await createRoom(alice, "Layout test", "AliceLongName");
  await joinRoom(bob, roomUrl, "Bob");

  // Two players => two visible PlayerCard nodes.
  const visibleCards = (page: typeof alice) =>
    page.locator("[data-testid='player-card']:visible");

  await expect(visibleCards(alice)).toHaveCount(2, { timeout: 10_000 });
  await expect(visibleCards(bob)).toHaveCount(2, { timeout: 10_000 });

  // Each visible PlayerCard carries a name pill with the full nickname.
  for (const page of [alice, bob]) {
    const cards = visibleCards(page);
    const count = await cards.count();
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      const pill = card.getByTestId("player-name-pill");
      await expect(pill).toHaveCount(1);
      const nick = await card.getAttribute("data-player-nickname");
      expect(nick).toBeTruthy();
      await expect(pill).toHaveText(nick!);
    }
  }

  // Sanity: full long name visible in the pill — would fail if we still
  // rendered just the first letter.
  await expect(
    alice.locator("[data-testid='player-name-pill']:visible", { hasText: "AliceLongName" })
  ).toHaveCount(1);

  await aliceCtx.close();
  await bobCtx.close();
});
