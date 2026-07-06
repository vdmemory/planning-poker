import { test, expect } from "@playwright/test";

test.describe("FAQ page (/faq)", () => {
  test("loads and lists the FAQ questions", async ({ page }) => {
    await page.goto("/faq");
    await expect(page.getByRole("heading", { name: /frequently asked questions/i })).toBeVisible();
    await expect(page.getByTestId("faq-item")).toHaveCount(6);
    await expect(page.getByText(/what is planning poker/i)).toBeVisible();
  });

  test("each question expands to show its answer", async ({ page }) => {
    await page.goto("/faq");
    const first = page.getByTestId("faq-item").first();
    // <details> content isn't visible until opened.
    await expect(first.locator("p")).not.toBeVisible();
    await first.locator("summary").click();
    await expect(first.locator("p")).toBeVisible();
  });
});
