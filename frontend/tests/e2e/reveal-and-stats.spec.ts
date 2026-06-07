import { test, expect } from "@playwright/test";
import { createRoom, voteCard } from "./helpers";

test("facilitator votes, clicks Reveal, sees average, then starts a new round", async ({ page }) => {
  await createRoom(page, "Reveal test");

  await voteCard(page, "8");

  // Reveal becomes available; click it.
  await page.getByRole("button", { name: /reveal cards/i }).click();

  // Post-reveal: Average label visible plus New round button.
  await expect(page.getByText("Average").first()).toBeVisible({ timeout: 5_000 });
  const newRound = page.getByRole("button", { name: /new round/i });
  await expect(newRound).toBeVisible();

  // New round resets the revealed state.
  await newRound.click();
  // Several elements contain the word "Average" (table center + stats panel);
  // we just check the main table-center one disappears using `.first()`.
  await expect(page.getByText("Average").first()).toBeHidden({ timeout: 5_000 });
});
