import { test, expect } from "@playwright/test";
import { createRoom } from "./helpers";

/**
 * Issue #6 — clicking the pencil button toggles drawing mode on/off (used to
 * open a color picker first; now the click is a direct toggle and the color
 * picker has moved to a dedicated swatch button).
 */
test("pencil button toggles drawing mode on each click", async ({ page }) => {
  await createRoom(page, "Drawing toggle test", "Painter");

  const toggle = page.getByTestId("drawing-toggle");
  await expect(toggle).toHaveAttribute("data-active", "false");

  // First click — enters drawing mode immediately, without going through a
  // color picker (that was the issue #6 fix).
  await toggle.click();
  await expect(toggle).toHaveAttribute("data-active", "true");

  // Second click — exits.
  await toggle.click();
  await expect(toggle).toHaveAttribute("data-active", "false");
});

test("ESC key still exits drawing mode (regression check for issue #6)", async ({ page }) => {
  await createRoom(page, "Drawing ESC test", "Painter");
  const toggle = page.getByTestId("drawing-toggle");

  await toggle.click();
  await expect(toggle).toHaveAttribute("data-active", "true");

  await page.keyboard.press("Escape");
  await expect(toggle).toHaveAttribute("data-active", "false");
});

/**
 * Issue #3 — strokes auto-fade after ~5s (STROKE_LIFETIME_MS in DrawingCanvas).
 * We observe the live stroke count through the `data-stroke-count` attribute
 * that the render loop keeps in sync with `playersRef`. Painting a line via
 * mouse events bumps the count to ≥1; waiting past the lifetime drops it
 * back to 0 once the cleanup pass on the next frame runs.
 */
test("a completed stroke disappears from the canvas after ~5 seconds", async ({ page }) => {
  await createRoom(page, "Drawing fade test", "Painter");

  // Enter drawing mode so the canvas captures mouse events.
  await page.getByTestId("drawing-toggle").click();

  const canvas = page.getByTestId("drawing-canvas");
  await expect(canvas).toBeVisible();

  // Paint a short stroke across the canvas with multiple intermediate points
  // (the canvas component requires >1 point to register a completed stroke).
  const box = await canvas.boundingBox();
  if (!box) throw new Error("Canvas has no bounding box");
  const startX = box.x + box.width * 0.4;
  const startY = box.y + box.height * 0.5;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(startX + i * 12, startY + i * 4);
  }
  await page.mouse.up();

  // The stroke is on-canvas now.
  await expect(canvas).toHaveAttribute("data-stroke-count", /[1-9]/, { timeout: 2000 });

  // After STROKE_LIFETIME_MS (5s) the cleanup pass removes the stroke. Allow
  // a little slack for the next animation frame to tick over.
  await expect(canvas).toHaveAttribute("data-stroke-count", "0", { timeout: 7000 });
});
