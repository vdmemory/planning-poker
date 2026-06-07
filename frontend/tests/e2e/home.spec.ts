import { test, expect } from "@playwright/test";

test.describe("Home page", () => {
  test("renders the create-game form", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText(/create game/i).first()).toBeVisible();
    await expect(page.getByPlaceholder("Sprint 42 Planning")).toBeVisible();
    await expect(page.getByRole("button", { name: /create game/i })).toBeVisible();
  });

  test("create-game button shows error when name is empty", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /create game/i }).click();
    await expect(page.getByText(/enter a game name/i)).toBeVisible();
    // Still on home, no navigation
    await expect(page).toHaveURL("/");
  });
});
