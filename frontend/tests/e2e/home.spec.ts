import { test, expect } from "@playwright/test";

/**
 * Issue #22 moved the create-room form off `/` (now the marketing landing
 * page — see landing.spec.ts) to `/new`.
 */
test.describe("Room creation page (/new)", () => {
  test("renders the create-game form", async ({ page }) => {
    await page.goto("/new");
    await expect(page.getByText(/create game/i).first()).toBeVisible();
    await expect(page.getByPlaceholder("Sprint 42 Planning")).toBeVisible();
    await expect(page.getByRole("button", { name: /create game/i })).toBeVisible();
  });

  test("create-game button shows error when name is empty", async ({ page }) => {
    await page.goto("/new");
    await page.getByRole("button", { name: /create game/i }).click();
    await expect(page.getByText(/enter a game name/i)).toBeVisible();
    // Still on the creation page, no navigation
    await expect(page).toHaveURL("/new");
  });
});
