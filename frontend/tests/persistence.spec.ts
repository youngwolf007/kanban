import { expect, test } from "@playwright/test";
import { firstBoardId, signIn as signInOnly, startFresh } from "./helpers";

const signIn = startFresh;

test("a new card is still there after a reload", async ({ page }) => {
  await signIn(page);
  const column = page.getByTestId("column-col-backlog");

  await column.getByRole("button", { name: /add a card/i }).click();
  await column.getByPlaceholder("Card title").fill("Persisted card");
  await column.getByPlaceholder("Details").fill("Should survive a reload.");
  await column.getByRole("button", { name: /add card/i }).click();
  await expect(column.getByText("Persisted card")).toBeVisible();

  await page.reload();

  await expect(
    page.getByTestId("column-col-backlog").getByText("Persisted card")
  ).toBeVisible();
});

test("an edited card keeps its edit after a reload", async ({ page }) => {
  await signIn(page);

  const card = page.getByTestId("card-card-3");
  await card.getByRole("button", { name: /^edit/i }).click();
  await card.getByLabel("Card title").fill("Edited and saved");
  await card.getByLabel("Card details").fill("New details here.");
  await card.getByRole("button", { name: /save card/i }).click();
  await expect(page.getByText("Edited and saved")).toBeVisible();

  await page.reload();

  await expect(page.getByText("Edited and saved")).toBeVisible();
  await expect(page.getByText("New details here.")).toBeVisible();
});

test("a moved card stays in its new column after a reload", async ({ page }) => {
  await signIn(page);
  const handle = page
    .getByTestId("card-card-4")
    .getByRole("button", { name: /^drag/i });
  const target = page.getByTestId("column-col-done");

  const cardBox = await handle.boundingBox();
  const targetBox = await target.boundingBox();
  if (!cardBox || !targetBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 120, {
    steps: 12,
  });
  await page.mouse.up();
  await expect(target.getByTestId("card-card-4")).toBeVisible();

  await page.reload();

  await expect(
    page.getByTestId("column-col-done").getByTestId("card-card-4")
  ).toBeVisible();
});

test("a renamed column keeps its name after a reload", async ({ page }) => {
  await signIn(page);
  const title = page.getByTestId("column-col-review").getByLabel("Column title");

  await title.fill("Renamed and saved");
  // The rename save is debounced, so wait for the request to actually go out.
  await page.waitForResponse(
    (response) =>
      response.url().includes("/api/board") && response.request().method() === "PUT"
  );

  await page.reload();

  await expect(
    page.getByTestId("column-col-review").getByLabel("Column title")
  ).toHaveValue("Renamed and saved");
});

test("a deleted card stays deleted after a reload", async ({ page }) => {
  await signIn(page);
  const card = page.getByTestId("card-card-6");
  await card.getByRole("button", { name: /^delete/i }).click();
  await expect(page.getByTestId("card-card-6")).toBeHidden();

  await page.reload();

  await expect(page.getByTestId("card-card-6")).toBeHidden();
});

test("the board is unchanged after signing out and back in", async ({ page }) => {
  await signIn(page);
  const column = page.getByTestId("column-col-discovery");
  await column.getByRole("button", { name: /add a card/i }).click();
  await column.getByPlaceholder("Card title").fill("Across sessions");
  await column.getByRole("button", { name: /add card/i }).click();
  await expect(column.getByText("Across sessions")).toBeVisible();

  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page.getByLabel("Username")).toBeVisible();

  // Plain sign in: resetting the board here would erase what we are checking.
  await signInOnly(page);

  await expect(
    page.getByTestId("column-col-discovery").getByText("Across sessions")
  ).toBeVisible();
});

test("the board comes from the api, not the bundle", async ({ page }) => {
  await signIn(page);
  const boardId = await firstBoardId(page);
  const response = await page.request.get(`/api/boards/${boardId}`);
  expect(response.status()).toBe(200);

  const board = await response.json();
  const firstColumnTitle = board.columns[0].title;
  await expect(
    page.getByTestId("column-col-backlog").getByLabel("Column title")
  ).toHaveValue(firstColumnTitle);
});
