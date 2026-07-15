import { test, expect, Page } from "@playwright/test";
import { createRetroBoard, joinRetroBoard } from "./retro-helpers";

/**
 * Issue #66 — emoji picker, GIF search, and direct image URL when composing
 * or editing a retro card. GIF search hits the backend's GIPHY proxy
 * (`GET /api/retro-boards/gif-search`), which we mock here so the suite
 * never depends on a real GIPHY_API_KEY or network access.
 */

async function mockGifSearch(page: Page): Promise<void> {
  await page.route("**/api/retro-boards/gif-search**", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        results: [
          {
            id: "gif1",
            preview_url: "https://example.com/preview1.gif",
            url: "https://example.com/full1.gif",
            title: "Test GIF",
          },
        ],
      }),
    });
  });
}

test("inserting an emoji from the picker adds it to the card text at the cursor", async ({ page }) => {
  await createRetroBoard(page, "Emoji picker retro");
  const column = page.locator("[data-testid='retro-column']").filter({ hasText: "Mad" }).first();
  const input = column.getByTestId("retro-add-card-input");

  await input.fill("Great job");
  await input.click();
  await column.getByTestId("retro-add-card-attachment-trigger").click();
  await expect(column.getByTestId("retro-card-attachment-picker")).toBeVisible();
  await column.locator("[data-emoji-value='🎉']").first().click();

  await expect(input).toHaveValue("Great job🎉");

  await input.press("Enter");
  await expect(column.getByTestId("retro-card").filter({ hasText: "Great job🎉" })).toBeVisible({ timeout: 10_000 });
});

test("picking a GIF from search results attaches it to the new card", async ({ page }) => {
  await mockGifSearch(page);
  await createRetroBoard(page, "GIF search retro");
  const column = page.locator("[data-testid='retro-column']").filter({ hasText: "Mad" }).first();

  await column.getByTestId("retro-add-card-input").fill("Look at this");
  await column.getByTestId("retro-add-card-attachment-trigger").click();
  await column.getByTestId("retro-attachment-tab-image").click();

  const result = column.getByTestId("retro-attachment-gif-result").first();
  await expect(result).toBeVisible({ timeout: 10_000 });
  await result.click();

  await expect(column.getByTestId("retro-add-card-image-preview")).toHaveAttribute("src", "https://example.com/full1.gif");

  await column.getByTestId("retro-add-card-input").press("Enter");
  const card = column.getByTestId("retro-card").filter({ hasText: "Look at this" });
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(card.getByTestId("retro-card-image")).toHaveAttribute("src", "https://example.com/full1.gif");
});

test("pasting a direct image URL attaches it to the new card", async ({ page }) => {
  await createRetroBoard(page, "Direct URL retro");
  const column = page.locator("[data-testid='retro-column']").filter({ hasText: "Mad" }).first();

  await column.getByTestId("retro-add-card-input").fill("Direct link card");
  await column.getByTestId("retro-add-card-attachment-trigger").click();
  await column.getByTestId("retro-attachment-tab-image").click();
  await column.getByTestId("retro-attachment-url-input").fill("https://example.com/direct.png");
  await column.getByTestId("retro-attachment-url-submit").click();

  await expect(column.getByTestId("retro-add-card-image-preview")).toHaveAttribute("src", "https://example.com/direct.png");

  await column.getByTestId("retro-add-card-input").press("Enter");
  const card = column.getByTestId("retro-card").filter({ hasText: "Direct link card" });
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(card.getByTestId("retro-card-image")).toHaveAttribute("src", "https://example.com/direct.png");
});

test("removing the pending image before submitting leaves the card without one", async ({ page }) => {
  await createRetroBoard(page, "Remove pending image retro");
  const column = page.locator("[data-testid='retro-column']").filter({ hasText: "Mad" }).first();

  await column.getByTestId("retro-add-card-input").fill("No image after all");
  await column.getByTestId("retro-add-card-attachment-trigger").click();
  await column.getByTestId("retro-attachment-tab-image").click();
  await column.getByTestId("retro-attachment-url-input").fill("https://example.com/direct.png");
  await column.getByTestId("retro-attachment-url-submit").click();
  await expect(column.getByTestId("retro-add-card-image-preview")).toBeVisible();

  await column.getByTestId("retro-add-card-image-remove").click();
  await expect(column.getByTestId("retro-add-card-image-preview")).toHaveCount(0);

  await column.getByTestId("retro-add-card-input").press("Enter");
  const card = column.getByTestId("retro-card").filter({ hasText: "No image after all" });
  await expect(card).toBeVisible({ timeout: 10_000 });
  await expect(card.getByTestId("retro-card-image")).toHaveCount(0);
});

test("editing a card can attach an image, visible to another participant", async ({ browser }) => {
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const alice = await aliceCtx.newPage();
  const bob = await bobCtx.newPage();

  const boardUrl = await createRetroBoard(alice, "Edit image retro", "Alice");
  await joinRetroBoard(bob, boardUrl, "Bob");

  const aliceColumn = alice.locator("[data-testid='retro-column']").filter({ hasText: "Mad" }).first();
  await aliceColumn.getByTestId("retro-add-card-input").fill("Editable card");
  await aliceColumn.getByTestId("retro-add-card-input").press("Enter");
  const aliceCard = aliceColumn.getByTestId("retro-card").filter({ hasText: "Editable card" });
  await expect(aliceCard).toBeVisible({ timeout: 10_000 });

  await aliceCard.getByTestId("retro-card-edit").click();
  await aliceCard.getByTestId("retro-card-edit-attachment-trigger").click();
  await aliceCard.getByTestId("retro-attachment-tab-image").click();
  await aliceCard.getByTestId("retro-attachment-url-input").fill("https://example.com/edited.png");
  await aliceCard.getByTestId("retro-attachment-url-submit").click();
  await expect(aliceCard.getByTestId("retro-card-edit-image-preview")).toBeVisible();
  await aliceCard.getByRole("button", { name: /^save$/i }).click();

  await expect(aliceCard.getByTestId("retro-card-image")).toHaveAttribute("src", "https://example.com/edited.png", { timeout: 10_000 });

  const bobColumn = bob.locator("[data-testid='retro-column']").filter({ hasText: "Mad" }).first();
  const bobCard = bobColumn.getByTestId("retro-card").filter({ hasText: "Editable card" });
  await expect(bobCard.getByTestId("retro-card-image")).toHaveAttribute("src", "https://example.com/edited.png", { timeout: 10_000 });

  await aliceCtx.close();
  await bobCtx.close();
});
