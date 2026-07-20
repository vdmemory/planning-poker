import { test, expect } from "@playwright/test";

/**
 * Issue #67 — two new column templates ("What went well / To improve /
 * Action items" and an extended 5-column variant), with the extended one
 * listed first and selected by default on `/retro/new`.
 */

test("extended template is selected by default and its columns render when creating without touching the picker", async ({ page }) => {
  await page.goto("/retro/new");

  // First template card in the list is the extended one and starts selected
  // (accent border + checkmark) — RetroNewPage's default useState.
  const cards = page.locator("button", { hasText: "What went well" });
  await expect(cards.first()).toContainText("Risks");
  await expect(cards.first()).toContainText("How do you find the team's processes?");

  await page.getByPlaceholder("Sprint 42 Retro").fill("Default template retro");
  await page.getByRole("button", { name: /create board/i }).click();
  await page.waitForURL(/\/retro\/(?!new$)[a-z0-9]+$/);
  await page.getByPlaceholder("Alice").fill("Alice");
  await page.getByRole("button", { name: /continue to board/i }).click();

  const columns = page.getByTestId("retro-column");
  await expect(columns).toHaveCount(5, { timeout: 10_000 });
  await expect(columns.nth(0)).toContainText("What went well");
  await expect(columns.nth(1)).toContainText("To improve");
  await expect(columns.nth(2)).toContainText("Risks");
  await expect(columns.nth(3)).toContainText("Action items");
  await expect(columns.nth(4)).toContainText("How do you find the team's processes?");
});

test("selecting the 3-column What went well / To improve / Action items template creates a board with those columns", async ({ page }) => {
  await page.goto("/retro/new");
  await page.getByText("What went well / To improve / Action items", { exact: true }).click();

  await page.getByPlaceholder("Sprint 42 Retro").fill("Simple template retro");
  await page.getByRole("button", { name: /create board/i }).click();
  await page.waitForURL(/\/retro\/(?!new$)[a-z0-9]+$/);
  await page.getByPlaceholder("Alice").fill("Alice");
  await page.getByRole("button", { name: /continue to board/i }).click();

  const columns = page.getByTestId("retro-column");
  await expect(columns).toHaveCount(3, { timeout: 10_000 });
  await expect(columns.nth(0)).toContainText("What went well");
  await expect(columns.nth(1)).toContainText("To improve");
  await expect(columns.nth(2)).toContainText("Action items");
  await expect(page.getByText("Risks")).toHaveCount(0);
});

test("template picker lists the extended template first, ahead of the older presets", async ({ page }) => {
  await page.goto("/retro/new");
  const names = await page.locator("button div.font-medium").allTextContents();
  expect(names[0]).toContain("What went well / To improve / Risks / Action items");
  expect(names).toContain("Mad / Sad / Glad");
  expect(names.indexOf(names[0])).toBeLessThan(names.indexOf("Mad / Sad / Glad"));
});
