import { test, expect } from "@playwright/test";

/**
 * Issue #22 — `/` is now a marketing landing page instead of the
 * create-room form (that moved to `/new`, see home.spec.ts).
 */
test.describe("Landing page (/)", () => {
  test("renders hero, how-it-works, and features sections", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /planning poker for agile teams/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /how it works/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /^features$/i })).toBeVisible();
  });

  test("CTA navigates to the room-creation page", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("landing-cta").click();
    await expect(page).toHaveURL("/new");
    await expect(page.getByPlaceholder("Sprint 42 Planning")).toBeVisible();
  });

  test("header nav links to FAQ and room creation", async ({ page }) => {
    await page.goto("/");
    // Both header nav and footer carry a "FAQ" / "Create a room" link —
    // scope to the header's <nav> to avoid a strict-mode ambiguity.
    const headerNav = page.getByRole("navigation");
    await headerNav.getByRole("link", { name: "FAQ" }).click();
    await expect(page).toHaveURL("/faq");

    await page.getByRole("navigation").getByRole("link", { name: /create a room/i }).click();
    await expect(page).toHaveURL("/new");
  });
});
