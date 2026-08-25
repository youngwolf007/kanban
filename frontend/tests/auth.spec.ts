import { expect, test } from "@playwright/test";

test("shows the login form, not the board, when signed out", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByLabel("Username")).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);
});

test("rejects wrong credentials with a message", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("wrong");
  await page.getByRole("button", { name: /sign in/i }).click();

  // Scoped by testid: Next renders its own role="alert" route announcer.
  await expect(page.getByTestId("login-error")).toContainText(
    /invalid username or password/i
  );
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);
});

test("signs in with the dummy credentials and shows the board", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();

  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
});

test("keeps the user signed in across a reload", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);

  await page.reload();

  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
  await expect(page.getByLabel("Username")).toBeHidden();
});

test("signs out and returns to the login form", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);

  await page.getByRole("button", { name: /sign out/i }).click();

  await expect(page.getByLabel("Username")).toBeVisible();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(0);
});

test("stays signed out after signing out and reloading", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.getByRole("button", { name: /sign out/i }).click();
  await expect(page.getByLabel("Username")).toBeVisible();

  await page.reload();

  await expect(page.getByLabel("Username")).toBeVisible();
});

test("the session cookie is not readable from javascript", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);

  expect(await page.evaluate(() => document.cookie)).not.toContain("session");
});
