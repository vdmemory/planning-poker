import { test, expect, type Page } from "@playwright/test";
import { createRoom, joinRoom } from "./helpers";

/**
 * Issue #23 — mobile adaptation. All tests here run at an iPhone SE-ish
 * viewport (375×667, the narrowest of the three sizes named in the issue)
 * with touch support enabled, and cover the five key flows plus the
 * touch-drawing fix.
 */
test.use({ viewport: { width: 375, height: 667 }, hasTouch: true });

test("facilitator creates a room and a second player joins via the invite link", async ({ browser }) => {
  const aliceCtx = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true });
  const bobCtx = await browser.newContext({ viewport: { width: 375, height: 667 }, hasTouch: true });
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  const roomUrl = await createRoom(alice, "Mobile test");
  await joinRoom(bob, roomUrl, "Bob");

  // PokerTable renders once at every breakpoint (issue #23 follow-up — it
  // used to have a separate mobile fallback with its own player list, which
  // meant two name pills existed in the DOM for the same player and needed
  // this same `:visible` filter to disambiguate). Kept here defensively;
  // harmless now that there's only one match either way.
  await expect(alice.locator('[data-testid="player-name-pill"]:visible', { hasText: "Bob" })).toBeVisible({ timeout: 10_000 });
  await expect(bob.locator('[data-testid="player-name-pill"]:visible', { hasText: "Alice" })).toBeVisible({ timeout: 10_000 });

  await aliceCtx.close();
  await bobCtx.close();
});

test("vote and reveal works on a narrow viewport", async ({ page }) => {
  await createRoom(page, "Mobile vote test");

  // See the comment on the previous test — PokerTable is unified across
  // breakpoints now, so this `:visible` narrowing is no longer load-bearing
  // for text inside it, just kept as a defensive habit.
  const visible = (l: ReturnType<Page["getByText"]>) => l.and(page.locator(":visible")).first();

  const card5 = page.getByRole("button", { name: "5", exact: true });
  await expect(card5).toBeVisible({ timeout: 10_000 });
  await card5.click();

  await expect(visible(page.getByText(/all voted/i))).toBeVisible({ timeout: 10_000 });

  const reveal = page.getByRole("button", { name: /reveal cards/i }).and(page.locator(":visible")).first();
  await reveal.click();

  await expect(visible(page.getByText("Average"))).toBeVisible({ timeout: 5_000 });
});

test("Game Settings modal stays fully reachable on a short mobile viewport", async ({ page }) => {
  await createRoom(page, "Mobile settings test");

  // The room name in the header opens Game Settings for the facilitator.
  await page.getByRole("button", { name: "Mobile settings test" }).click();

  const saveButton = page.getByRole("button", { name: "Save" });
  await expect(saveButton).toBeVisible();

  // Issue #23 — the modal used to size its body to 70vh with no cap on the
  // outer box, so on a 667px-tall viewport the Save button could end up
  // below the fold. Assert it's actually within the visible viewport.
  const box = await saveButton.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y + box!.height).toBeLessThanOrEqual(667);

  // Changing deck (flow #4 in the issue) still works from inside the
  // height-constrained, scrollable body.
  await page.getByText("T-Shirt").click();
  await saveButton.click();
  await expect(page.getByText("XS", { exact: true }).first()).toBeVisible({ timeout: 5_000 });
});

test("issue sidebar opens as a full-screen drawer and doesn't squeeze the game screen", async ({ page }) => {
  await createRoom(page, "Mobile issues test");

  await page.getByTitle("Toggle issues sidebar").click();

  const sidebar = page.getByText("Issues").first();
  await expect(sidebar).toBeVisible();

  // Issue #23 — the drawer is a fixed overlay (~85vw wide), not an inline
  // flex column that leaves only a sliver for the main game screen.
  const heading = page.locator("h3", { hasText: "Issues" });
  const asideBox = await heading.locator("xpath=ancestor::aside").boundingBox();
  expect(asideBox).not.toBeNull();
  expect(asideBox!.width).toBeGreaterThan(300); // ~85% of 375px
  expect(asideBox!.width).toBeLessThan(375);

  await page.getByRole("button", { name: /add another issue/i }).click();
  await page.getByPlaceholder("Enter a title for the issue").fill("Fix mobile layout");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Fix mobile layout").first()).toBeVisible();

  await page.getByRole("button", { name: /vote this issue/i }).click();
  await expect(page.locator("main").getByText("Fix mobile layout").first()).toBeVisible();
});

test("estimate picker on mobile actually sets the estimate (regression: mousedown-outside-close bug)", async ({ page }) => {
  await createRoom(page, "Mobile estimate test");
  await page.getByTitle("Toggle issues sidebar").click();
  await page.getByRole("button", { name: /add another issue/i }).click();
  await page.getByPlaceholder("Enter a title for the issue").fill("Mobile estimate check");
  await page.keyboard.press("Enter");

  // Issue #23 follow-up regression — the mobile modal and desktop dropdown
  // are separate DOM subtrees (only one `display`s at a time), and the
  // outside-click-closes listener briefly only checked the desktop one.
  // On mobile that misread every tap *inside* the modal as "outside" and
  // closed the picker via `mousedown` a beat before the click's onSelect
  // handler ran, so the estimate never actually changed. Scope to the
  // trigger button's wrapper — the bottom voting deck also has a "13" card.
  const wrapper = page.locator('button[title="Set estimate"]').locator("xpath=..");
  await wrapper.locator('button[title="Set estimate"]').click();
  await wrapper.getByRole("button", { name: "13", exact: true }).and(page.locator(":visible")).click();

  await expect(page.locator('button[title="Set estimate"]:visible')).toHaveText("13");
});

async function touchDraw(page: Page, points: { x: number; y: number }[]) {
  await page.evaluate((pts) => {
    const canvas = document.querySelector('[data-testid="drawing-canvas"]') as HTMLElement;
    function fire(type: string, x: number, y: number) {
      const touch = new Touch({ identifier: 1, target: canvas, clientX: x, clientY: y });
      canvas.dispatchEvent(
        new TouchEvent(type, {
          touches: type === "touchend" ? [] : [touch],
          changedTouches: [touch],
          bubbles: true,
          cancelable: true,
        })
      );
    }
    fire("touchstart", pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) fire("touchmove", pts[i].x, pts[i].y);
    fire("touchend", pts[pts.length - 1].x, pts[pts.length - 1].y);
  }, points);
}

test("revote picker on mobile actually changes the vote (regression: mousedown-outside-close bug)", async ({ page }) => {
  await createRoom(page, "Mobile revote test");

  const card5 = page.getByRole("button", { name: "5", exact: true }).and(page.locator(":visible")).first();
  await card5.click();
  const reveal = page.getByRole("button", { name: /reveal cards/i }).and(page.locator(":visible")).first();
  await expect(reveal).toBeVisible({ timeout: 10_000 });
  await reveal.click();
  await expect(page.getByText("Average").and(page.locator(":visible")).first()).toBeVisible({ timeout: 5_000 });

  // See the equivalent estimate-picker regression test above for the root
  // cause — same bug, same fix, different picker (pencil → change your vote).
  await page.locator('button[title="Change your vote"]:visible').click();
  await page.getByRole("button", { name: "8", exact: true }).and(page.locator(":visible")).click();

  // toContainText auto-retries until the WS round-trip lands; a plain
  // .innerText() read races ahead of it and reads the stale "5".
  await expect(page.locator('[data-testid="player-card"]:visible').first()).toContainText("8", { timeout: 5_000 });
});

test("drawing with a finger (touch events) puts a stroke on the canvas", async ({ page }) => {
  await createRoom(page, "Mobile drawing test", "Painter");

  await page.getByTestId("drawing-toggle").click();
  const canvas = page.getByTestId("drawing-canvas");
  await expect(canvas).toBeVisible();

  const points = Array.from({ length: 8 }, (_, i) => ({ x: 60 + i * 12, y: 200 + i * 4 }));
  await touchDraw(page, points);

  await expect(canvas).toHaveAttribute("data-stroke-count", /[1-9]/, { timeout: 2000 });
});
