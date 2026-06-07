import { test, expect } from "@playwright/test";
import { createRoom, joinRoom } from "./helpers";

/**
 * Issue #7: nickname is shown in a colored pill ABOVE the card.
 * The duplicate caption that used to sit UNDER the card was removed.
 * The letter-avatar circle that used to sit above the card was replaced
 * by the full-name pill.
 *
 * The room screen has TWO layouts in the DOM at the same time — mobile
 * (md:hidden) and desktop (hidden md:flex) — exactly one is visible per
 * viewport size. We assert against visible elements only so the test
 * doesn't double-count.
 */
test("player nickname renders as a pill above the card, not under it", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  const roomUrl = await createRoom(alice, "Layout test", "AliceLongName");
  await joinRoom(bob, roomUrl, "Bob");

  // At default desktop viewport, exactly one layout (the oval table) is
  // visible — so two players => two visible PlayerCard nodes.
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
