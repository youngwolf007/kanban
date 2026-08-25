import { expect, test } from "@playwright/test";
import { startFresh } from "./helpers";

// Board changes now persist, so every test starts from the demo board.
const signIn = startFresh;

test("loads the kanban board", async ({ page }) => {
  await signIn(page);
  await expect(page.getByRole("heading", { name: "Kanban Studio" })).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("loads without console errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    // The signed-out session check answers 401 by design, and the browser logs
    // that as a failed resource. It is expected, so it is not an app error.
    const isExpectedSessionCheck = message.location().url.includes("/api/auth/me");
    if (message.type() === "error" && !isExpectedSessionCheck) {
      errors.push(message.text());
    }
  });
  page.on("pageerror", (error) => errors.push(error.message));

  await signIn(page);

  expect(errors).toEqual([]);
});

test("serves the api alongside the static site", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});

test("adds a card to a column", async ({ page }) => {
  await signIn(page);
  const firstColumn = page.locator('[data-testid^="column-"]').first();
  await firstColumn.getByRole("button", { name: /add a card/i }).click();
  await firstColumn.getByPlaceholder("Card title").fill("Playwright card");
  await firstColumn.getByPlaceholder("Details").fill("Added via e2e.");
  await firstColumn.getByRole("button", { name: /add card/i }).click();
  await expect(firstColumn.getByText("Playwright card")).toBeVisible();
});

test("deletes a card", async ({ page }) => {
  await signIn(page);
  const column = page.getByTestId("column-col-backlog");
  await expect(column.getByText("Align roadmap themes")).toBeVisible();
  // Scoped to the card: dnd-kit gives the card article role="button" too, so an
  // unscoped role lookup matches both the article and the Remove button.
  await page.getByTestId("card-card-1").getByRole("button", { name: /^delete/i }).click();
  await expect(column.getByText("Align roadmap themes")).toBeHidden();
});

test("renames a column", async ({ page }) => {
  await signIn(page);
  const column = page.getByTestId("column-col-backlog");
  const title = column.getByLabel("Column title");
  await title.fill("Renamed column");
  await expect(title).toHaveValue("Renamed column");
});

test("moves a card between columns", async ({ page }) => {
  await signIn(page);
  const card = page.getByTestId("card-card-1");
  const targetColumn = page.getByTestId("column-col-review");
  const cardBox = await card.boundingBox();
  const columnBox = await targetColumn.boundingBox();
  if (!cardBox || !columnBox) {
    throw new Error("Unable to resolve drag coordinates.");
  }

  await page.mouse.move(
    cardBox.x + cardBox.width / 2,
    cardBox.y + cardBox.height / 2
  );
  await page.mouse.down();
  await page.mouse.move(
    columnBox.x + columnBox.width / 2,
    columnBox.y + 120,
    { steps: 12 }
  );
  await page.mouse.up();
  await expect(targetColumn.getByTestId("card-card-1")).toBeVisible();
});
