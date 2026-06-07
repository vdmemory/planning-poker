import { test, expect } from "@playwright/test";
import { createRoom, voteCard } from "./helpers";

test("facilitator creates a room and casts a vote", async ({ page }) => {
  await createRoom(page, "Vote test");
  await voteCard(page, "5");
  // With one player the single vote moves the room to the everyone-voted state.
  await expect(page.getByRole("button", { name: /reveal cards/i })).toBeVisible({ timeout: 10_000 });
});
