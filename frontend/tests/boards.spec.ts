import { expect, test } from "@playwright/test";
import { startFresh } from "./helpers";

type BoardSummary = { id: number; name: string; updatedAt: string };

/**
 * Every other spec assumes the "user" account has exactly one board. These tests
 * create extras to exercise switching; delete everything but the oldest (lowest id,
 * so the account's original board survives) so later tests, in this file or another,
 * still find a single board.
 */
test.afterEach(async ({ page }) => {
  const response = await page.request.get("/api/boards");
  const boards: BoardSummary[] = await response.json();
  if (boards.length <= 1) {
    return;
  }
  const [, ...extra] = boards.sort((a, b) => a.id - b.id);
  for (const board of extra) {
    await page.request.delete(`/api/boards/${board.id}`);
  }
});

test("creates a board, seeded with the demo content", async ({ page }) => {
  await startFresh(page);

  await page.getByTestId("board-switcher").click();
  await page.getByTestId("board-create").click();

  await expect(page.getByTestId("board-switcher")).toContainText("New board");
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  await expect(page.getByTestId("column-col-backlog")).toContainText(
    "Align roadmap themes"
  );
});

test("switching boards does not mix up their cards", async ({ page }) => {
  await startFresh(page);

  // Add a card unique to the original board before creating a second one.
  const backlog = page.getByTestId("column-col-backlog");
  await backlog.getByRole("button", { name: /add a card/i }).click();
  await backlog.getByPlaceholder("Card title").fill("Only on board one");
  await backlog.getByRole("button", { name: /add card/i }).click();
  await expect(backlog.getByText("Only on board one")).toBeVisible();

  await page.getByTestId("board-switcher").click();
  await page.getByTestId("board-create").click();
  await expect(page.getByTestId("board-switcher")).toContainText("New board");

  // The new board is a fresh demo seed, not the first board's content.
  await expect(
    page.getByTestId("column-col-backlog").getByText("Only on board one")
  ).toHaveCount(0);

  // Switch back to the other board and confirm its card is still there. The name
  // button is the row's first button, before its Rename and Delete controls.
  await page.getByTestId("board-switcher").click();
  const otherBoard = page
    .getByTestId("board-menu")
    .locator('[data-testid^="board-option-"]')
    .filter({ hasNotText: "New board" });
  await otherBoard.locator("button").first().click();

  await expect(
    page.getByTestId("column-col-backlog").getByText("Only on board one")
  ).toBeVisible();
});

test("renames a board from the switcher", async ({ page }) => {
  await startFresh(page);

  await page.getByTestId("board-switcher").click();
  await page.getByRole("button", { name: /^Rename /i }).click();
  const input = page.getByLabel(/^New name for /);
  await input.fill("Renamed via e2e");
  await input.press("Enter");

  await expect(page.getByTestId("board-switcher")).toContainText("Renamed via e2e");
});

test("deletes a board and switches to what remains", async ({ page }) => {
  await startFresh(page);

  await page.getByTestId("board-switcher").click();
  await page.getByTestId("board-create").click();
  await expect(page.getByTestId("board-switcher")).toContainText("New board");

  await page.getByTestId("board-switcher").click();
  await page.getByRole("button", { name: /^Delete New board/i }).click();

  await expect(page.getByTestId("board-switcher")).not.toContainText("New board");
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});
