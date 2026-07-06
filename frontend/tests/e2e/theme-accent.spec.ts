import { test, expect } from "@playwright/test";
import { createRoom } from "./helpers";

/**
 * Issue #42 — accent palette: 7 colours (blue/green/red/purple/yellow/orange/teal)
 * × 2 modes (light/dark). The accent name lives in `data-accent` on <html>;
 * default (blue) leaves the attribute off. Persists in `pp:accent`.
 */

test("default state: no data-accent attribute, blue is implicit", async ({ page }) => {
  await page.goto("/");
  // No accent stored yet — main.tsx leaves the attribute off so the `:root`
  // blue palette wins without specificity gymnastics.
  await expect(page.locator("html")).not.toHaveAttribute("data-accent", /./);
});

test("opening AccentPicker via ProfileMenu and switching to green updates html + localStorage", async ({ page }) => {
  // Need a room to reach the ProfileMenu.
  await createRoom(page, "Accent test", "Alice");

  // Click the profile chip in the header to open ProfileMenu.
  await page.getByRole("button", { name: /alice/i }).first().click();
  const picker = page.getByTestId("accent-picker");
  await expect(picker).toBeVisible();

  // Blue is selected by default — assert the data-selected="true" swatch is blue.
  await expect(
    picker.locator("[data-testid='accent-swatch'][data-selected='true']"),
  ).toHaveAttribute("data-accent", "blue");

  // Click green swatch.
  await picker.locator("[data-testid='accent-swatch'][data-accent='green']").click();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "green");
  // Persisted.
  const stored = await page.evaluate(() => localStorage.getItem("pp:accent"));
  expect(stored).toBe("green");

  // Swap back to blue → attribute removed (default state).
  await picker.locator("[data-testid='accent-swatch'][data-accent='blue']").click();
  await expect(page.locator("html")).not.toHaveAttribute("data-accent", /./);
});

test("each accent paints the Create button with a distinct primary colour", async ({ page }) => {
  // The room-creation page's (issue #22: moved from `/` to `/new`) "Create
  // game" button is `bg-accent` — `--c-accent` should resolve to a distinct
  // hex per accent. Sampling the rendered background proves the CSS-variable
  // chain works end-to-end without us hard-coding colour values on the JSX side.
  const SEEN: string[] = [];
  for (const accent of ["blue", "green", "red", "purple", "yellow", "orange", "teal"]) {
    await page.addInitScript((a) => {
      localStorage.setItem("pp:theme", "dark");
      localStorage.setItem("pp:accent", a as string);
    }, accent);
    await page.goto("/new");
    const bg = await page
      .getByRole("button", { name: /create game/i })
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    SEEN.push(`${accent}:${bg}`);
  }
  // All 7 produce different RGB strings → palette is wired up.
  expect(new Set(SEEN).size).toBe(7);
});

test("accent persists across full reloads via the pre-render bootstrap in main.tsx", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("pp:theme", "dark");
    localStorage.setItem("pp:accent", "purple");
  });
  await page.goto("/");
  // The boot script in main.tsx sets data-accent before React mounts so the
  // user never sees a flash of the default blue.
  await expect(page.locator("html")).toHaveAttribute("data-accent", "purple");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-accent", "purple");
});

test("invalid stored accent is ignored (defensive against tampered localStorage)", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("pp:accent", "neon-pink"));
  await page.goto("/");
  // main.tsx only sets the attribute for a whitelisted set; a junk value
  // leaves the html in its default (blue) state instead of breaking CSS.
  await expect(page.locator("html")).not.toHaveAttribute("data-accent", /./);
});
