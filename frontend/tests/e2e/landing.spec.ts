import { test, expect } from "@playwright/test";

/**
 * Issue #22 — `/` is now a marketing landing page instead of the
 * create-room form (that moved to `/new`, see home.spec.ts). Redesigned
 * (follow-up) to present Planning Poker and Retro Board as two equally
 * weighted products instead of Retro Board being a bottom-of-page teaser.
 */
test.describe("Landing page (/)", () => {
  test("renders hero, quick-nav cards, and both products' how-it-works/features sections", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /real-time tools for agile teams/i })).toBeVisible();

    // Two-tool quick nav — equal billing right under the hero.
    await expect(page.getByTestId("landing-poker-nav-card")).toBeVisible();
    await expect(page.getByTestId("landing-retro-nav-card")).toBeVisible();

    // Both products get their own "How it works" and "Features" sections.
    await expect(page.getByRole("heading", { name: /how it works/i })).toHaveCount(2);
    await expect(page.getByRole("heading", { name: /^features$/i })).toHaveCount(2);
    await expect(page.getByRole("heading", { name: /estimate sprints without the guesswork/i })).toBeVisible();
    await expect(page.getByRole("heading", { name: /run retrospectives your team actually looks forward to/i })).toBeVisible();
  });

  test("CTA navigates to the room-creation page", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("landing-cta").click();
    await expect(page).toHaveURL("/new");
    await expect(page.getByPlaceholder("Sprint 42 Planning")).toBeVisible();
  });

  test("retro CTA navigates to the board-creation page", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("landing-retro-cta").click();
    await expect(page).toHaveURL("/retro/new");
    await expect(page.getByPlaceholder("Sprint 42 Retro")).toBeVisible();
  });

  test("quick-nav cards jump to each product's section", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("landing-poker-nav-card").click();
    await expect(page).toHaveURL(/#planning-poker$/);
    await page.getByTestId("landing-retro-nav-card").click();
    await expect(page).toHaveURL(/#retro-board$/);
  });

  test("header nav links to FAQ, Retro Board, and room creation", async ({ page }) => {
    await page.goto("/");
    // Header nav and footer both carry these links — scope to the header's
    // <nav> to avoid a strict-mode ambiguity.
    const headerNav = page.getByRole("navigation");
    await headerNav.getByRole("link", { name: "FAQ" }).click();
    await expect(page).toHaveURL("/faq");

    await page.goto("/");
    await page.getByRole("navigation").getByRole("link", { name: /^retro board$/i }).click();
    await expect(page).toHaveURL("/retro/new");

    await page.goto("/");
    await page.getByRole("navigation").getByRole("link", { name: /create a room/i }).click();
    await expect(page).toHaveURL("/new");
  });
});
