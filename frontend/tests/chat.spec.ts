import { expect, test, type Page } from "@playwright/test";
import { startFresh } from "./helpers";

// Every test here waits on a real OpenRouter call, which is slow and occasionally
// needs the backend's retry, so these get far longer than the default timeout.
test.describe.configure({ timeout: 180_000 });

const REPLY_TIMEOUT = 150_000;

/** The panel overlays the board, so it starts closed and each test opens it. */
const openChat = async (page: Page) => {
  await page.getByTestId("chat-open").click();
  await expect(page.getByTestId("chat-sidebar")).toBeVisible();
};

const ask = async (page: Page, message: string) => {
  await page.getByLabel("Message the assistant").fill(message);
  await page.getByRole("button", { name: "Send" }).click();
};

const backlog = (page: Page) => page.locator('[data-testid="column-col-backlog"]');

/** Waits for the assistant's reply rather than a fixed delay. */
const waitForReply = async (page: Page) => {
  await expect(page.getByTestId("chat-assistant").first()).toBeVisible({
    timeout: REPLY_TIMEOUT,
  });
  await expect(page.getByTestId("chat-error")).toHaveCount(0);
};

test("the assistant adds a card, and it appears without a reload", async ({ page }) => {
  await startFresh(page);
  await openChat(page);

  await ask(page, "Add a card titled Buy milk to the Backlog column.");
  await waitForReply(page);

  // Scoped to the column: the message bubbles also contain the words "Buy milk".
  await expect(backlog(page).getByText("Buy milk")).toBeVisible();
  await expect(backlog(page).getByText("3 cards")).toBeVisible();
});

test("a card the assistant added survives a reload", async ({ page }) => {
  await startFresh(page);
  await openChat(page);

  await ask(page, "Add a card titled Feed the cat to the Backlog column.");
  await waitForReply(page);
  await expect(backlog(page).getByText("Feed the cat")).toBeVisible();

  await page.reload();

  await expect(backlog(page).getByText("Feed the cat")).toBeVisible();
});

test("a plain question is answered and leaves the board alone", async ({ page }) => {
  await startFresh(page);
  await openChat(page);

  await ask(page, "How many cards are on the board? Do not change anything.");
  await waitForReply(page);

  await expect(backlog(page).getByText("2 cards")).toBeVisible();
  await expect(page.locator('[data-testid^="card-"]')).toHaveCount(8);
});

test("the sidebar opens, collapses and reopens", async ({ page }) => {
  await startFresh(page);
  await expect(page.getByTestId("chat-sidebar")).toHaveCount(0);

  await openChat(page);
  await page.getByTestId("chat-close").click();
  await expect(page.getByTestId("chat-sidebar")).toHaveCount(0);

  await page.getByTestId("chat-open").click();
  await expect(page.getByTestId("chat-sidebar")).toBeVisible();
});
