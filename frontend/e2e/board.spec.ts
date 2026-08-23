import { expect, test, type Locator, type Page } from "@playwright/test";

async function dragCard(page: Page, source: Locator, target: Locator) {
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error("Could not measure drag elements");

  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 10,
  });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 5,
  });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("loads with the single board, 5 columns, and seeded cards", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Project Board" })).toBeVisible();
  for (const title of ["Backlog", "To Do", "In Progress", "Review", "Done"]) {
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }
  await expect(page.getByText("Research competitor apps")).toBeVisible();
});

test("renames a column", async ({ page }) => {
  await page.getByText("Backlog", { exact: true }).click();
  const input = page.locator("input").first();
  await input.fill("Ideas");
  await input.press("Enter");

  await expect(page.getByText("Ideas", { exact: true })).toBeVisible();
  await expect(page.getByText("Backlog", { exact: true })).toHaveCount(0);
});

test("adds and deletes a card", async ({ page }) => {
  await page.getByRole("button", { name: "+ Add a card" }).first().click();
  await page.getByPlaceholder("Card title").fill("Write launch plan");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect(page.getByText("Write launch plan")).toBeVisible();

  const card = page.locator("div.group", { hasText: "Write launch plan" });
  await card.hover();
  await card.getByRole("button", { name: "Delete card" }).click();

  await expect(page.getByText("Write launch plan")).toHaveCount(0);
});

test("edits a card's title and details through the modal", async ({ page }) => {
  await page.getByText("Research competitor apps").click();
  await page.getByLabel("Title").fill("Research rivals");
  await page.getByLabel("Details").fill("Updated details");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByText("Research rivals")).toBeVisible();
  await expect(page.getByText("Updated details")).toBeVisible();
});

test("drags a card from one column to another", async ({ page }) => {
  const source = page.locator("div.group", { hasText: "Set up project repo" });
  const target = page.locator("div.group", { hasText: "Research competitor apps" });

  const backlogColumn = page.getByTestId("column-col-1");
  await expect(backlogColumn.getByText("Set up project repo")).toHaveCount(0);

  await dragCard(page, source, target);

  await expect(backlogColumn.getByText("Set up project repo")).toBeVisible();
});
