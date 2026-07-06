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

  // Below md, the desktop poker-table layout is `hidden` and a separate
  // mobile layout renders each player again — both copies exist in the DOM,
  // so scope to the one CSS actually shows at this viewport instead of
  // relying on DOM order (:visible; getByText().first() picks up the
  // display:none desktop copy here).
  await expect(alice.locator('[data-testid="player-name-pill"]:visible', { hasText: "Bob" })).toBeVisible({ timeout: 10_000 });
  await expect(bob.locator('[data-testid="player-name-pill"]:visible', { hasText: "Alice" })).toBeVisible({ timeout: 10_000 });

  await aliceCtx.close();
  await bobCtx.close();
});

test("vote and reveal works on a narrow viewport", async ({ page }) => {
  await createRoom(page, "Mobile vote test");

  // Below md the app renders both the desktop poker-table markup (display:
  // none) and the mobile fallback for the same state, so any text/role
  // query matching both copies must be narrowed to the one CSS actually
  // shows here — otherwise `.first()` picks the hidden desktop copy in DOM
  // order and every assertion below flakes out to "not visible".
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

test("drawing with a finger (touch events) puts a stroke on the canvas", async ({ page }) => {
  await createRoom(page, "Mobile drawing test", "Painter");

  await page.getByTestId("drawing-toggle").click();
  const canvas = page.getByTestId("drawing-canvas");
  await expect(canvas).toBeVisible();

  const points = Array.from({ length: 8 }, (_, i) => ({ x: 60 + i * 12, y: 200 + i * 4 }));
  await touchDraw(page, points);

  await expect(canvas).toHaveAttribute("data-stroke-count", /[1-9]/, { timeout: 2000 });
});
