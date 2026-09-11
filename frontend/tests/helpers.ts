import { expect, type Page } from "@playwright/test";

/**
 * The demo board, matching DEFAULT_BOARD in backend/app/models.py.
 * Every spec resets to this so tests do not inherit each other's changes.
 */
export const DEMO_BOARD = {
  columns: [
    { id: "col-backlog", title: "Backlog", cardIds: ["card-1", "card-2"] },
    { id: "col-discovery", title: "Discovery", cardIds: ["card-3"] },
    { id: "col-progress", title: "In Progress", cardIds: ["card-4", "card-5"] },
    { id: "col-review", title: "Review", cardIds: ["card-6"] },
    { id: "col-done", title: "Done", cardIds: ["card-7", "card-8"] },
  ],
  cards: {
    "card-1": {
      id: "card-1",
      title: "Align roadmap themes",
      details: "Draft quarterly themes with impact statements and metrics.",
    },
    "card-2": {
      id: "card-2",
      title: "Gather customer signals",
      details: "Review support tags, sales notes, and churn feedback.",
    },
    "card-3": {
      id: "card-3",
      title: "Prototype analytics view",
      details: "Sketch initial dashboard layout and key drill-downs.",
    },
    "card-4": {
      id: "card-4",
      title: "Refine status language",
      details: "Standardize column labels and tone across the board.",
    },
    "card-5": {
      id: "card-5",
      title: "Design card layout",
      details: "Add hierarchy and spacing for scanning dense lists.",
    },
    "card-6": {
      id: "card-6",
      title: "QA micro-interactions",
      details: "Verify hover, focus, and loading states.",
    },
    "card-7": {
      id: "card-7",
      title: "Ship marketing page",
      details: "Final copy approved and asset pack delivered.",
    },
    "card-8": {
      id: "card-8",
      title: "Close onboarding sprint",
      details: "Document release notes and share internally.",
    },
  },
};

export const signIn = async (page: Page) => {
  await page.goto("/");
  await page.getByLabel("Username").fill("user");
  await page.getByLabel("Password").fill("password");
  await page.getByRole("button", { name: /sign in/i }).click();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
};

/**
 * The signed-in user's first board, creating it the same way the app does (via the
 * board switcher's implicit first board) if none exists yet.
 */
export const firstBoardId = async (page: Page): Promise<number> => {
  const response = await page.request.get("/api/boards");
  expect(response.status()).toBe(200);
  const boards = await response.json();
  return boards[0].id;
};

/**
 * Puts the signed-in user's board back to the demo state, reusing the session
 * cookie the browser context already holds. Sign in first.
 */
export const resetBoard = async (page: Page) => {
  const boardId = await firstBoardId(page);
  const response = await page.request.put(`/api/boards/${boardId}`, {
    data: DEMO_BOARD,
  });
  expect(response.status()).toBe(200);
};

/**
 * Signs in through the UI, then resets the board and reloads.
 * Signing in must come first: an API login would set the cookie, the app would
 * skip straight to the board, and the UI sign in would have no form to fill.
 */
export const startFresh = async (page: Page) => {
  await signIn(page);
  await resetBoard(page);
  await page.reload();
  await expect(page.locator('[data-testid^="column-"]')).toHaveCount(5);
};
