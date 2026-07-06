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

/**
 * Issue #50 — the pencil cursor SVG is rotated + offset so a specific vertex
 * of its path (the (20,6) corner — the writing tip) lands exactly on the
 * mouse position regardless of tilt angle (`transformOrigin` pinned to that
 * same vertex). This asserts the tip vertex's rendered screen position
 * still matches the mouse coordinates pixel-for-pixel, and that the
 * "eraser" end (the (5,17)/(5,13) corners) renders up and to the left of
 * it — i.e. a right-handed writing tilt, not the old straight-up-and-down
 * orientation.
 */
test("pencil cursor tip stays pinned to the mouse position and tilts right", async ({ page }) => {
  await createRoom(page, "Pencil tilt test", "Painter");
  await page.getByTestId("drawing-toggle").click();
  await page.mouse.move(400, 300);

  const { tip, eraserD, eraserE } = await page.evaluate(() => {
    const svg = document.querySelector("svg[width='22'][height='22']") as SVGSVGElement;
    const point = (x: number, y: number) => {
      const marker = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      marker.setAttribute("cx", String(x));
      marker.setAttribute("cy", String(y));
      marker.setAttribute("r", "0.1");
      svg.appendChild(marker);
      const rect = marker.getBoundingClientRect();
      marker.remove();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    };
    return { tip: point(20, 6), eraserD: point(5, 17), eraserE: point(5, 13) };
  });

  // Tip vertex renders essentially exactly at the mouse position.
  expect(Math.abs(tip.x - 400)).toBeLessThan(1);
  expect(Math.abs(tip.y - 300)).toBeLessThan(1);

  // Eraser end is up (smaller y) and to the left (smaller x) of the tip.
  expect(eraserD.x).toBeLessThan(tip.x);
  expect(eraserD.y).toBeLessThan(tip.y);
  expect(eraserE.x).toBeLessThan(tip.x);
  expect(eraserE.y).toBeLessThan(tip.y);
});
