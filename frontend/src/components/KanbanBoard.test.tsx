import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import type { BoardSummary } from "@/lib/api";
import { initialData, type BoardData } from "@/lib/kanban";

/** Matches RENAME_SAVE_DELAY in KanbanBoard. */
const RENAME_SAVE_DELAY = 500;

const afterTheRenameDelay = () =>
  new Promise((resolve) => setTimeout(resolve, RENAME_SAVE_DELAY * 2));

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const oneBoard: BoardSummary[] = [
  { id: 1, name: "My board", updatedAt: "2026-01-01T00:00:00Z" },
];

/** boardId, boards and the switcher callbacks are owned by Workspace in the app;
 * these are no-ops here, since this suite drives KanbanBoard directly. */
const boardShellProps = {
  boardId: 1,
  boards: oneBoard,
  onSwitchBoard: vi.fn(),
  onCreateBoard: vi.fn(),
  onRenameBoard: vi.fn(),
  onDeleteBoard: vi.fn(),
};

let fetchMock: ReturnType<typeof vi.fn>;

const renderBoard = async (board: BoardData = initialData) => {
  // A fresh Response per call: a body can only be read once.
  fetchMock = vi.fn((_input: unknown, init?: RequestInit) =>
    Promise.resolve(
      jsonResponse(200, init?.method === "PUT" ? JSON.parse(init.body as string) : board)
    )
  );
  vi.stubGlobal("fetch", fetchMock);
  const view = render(<KanbanBoard {...boardShellProps} />);
  await screen.findByTestId("column-col-backlog");
  return view;
};

/** The body of the most recent PUT /api/board, as a board. */
const lastSavedBoard = (): BoardData => {
  const puts = fetchMock.mock.calls.filter(
    ([, init]) => (init as RequestInit | undefined)?.method === "PUT"
  );
  return JSON.parse((puts.at(-1)?.[1] as RequestInit).body as string);
};

const savesMade = () =>
  fetchMock.mock.calls.filter(
    ([, init]) => (init as RequestInit | undefined)?.method === "PUT"
  ).length;

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("KanbanBoard", () => {
  it("shows a loading state before the board arrives", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    render(<KanbanBoard {...boardShellProps} />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading board/i);
  });

  it("renders the board it loaded from the api", async () => {
    await renderBoard();
    expect(fetchMock).toHaveBeenCalledWith("/api/boards/1");
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
    expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();
  });

  it("shows the current board's name in the switcher", async () => {
    await renderBoard();
    expect(screen.getByTestId("board-switcher")).toHaveTextContent("My board");
  });

  it("renders whatever the api returns, not the local seed", async () => {
    await renderBoard({
      columns: [{ id: "col-backlog", title: "Only column", cardIds: ["card-x"] }],
      cards: { "card-x": { id: "card-x", title: "From the server", details: "." } },
    });

    expect(screen.getAllByTestId(/column-/i)).toHaveLength(1);
    expect(screen.getByText("From the server")).toBeInTheDocument();
    expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument();
  });

  it("shows an error when the board cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, {})));
    render(<KanbanBoard {...boardShellProps} />);
    expect(await screen.findByTestId("board-error")).toHaveTextContent(
      /could not load your board/i
    );
  });

  describe("saving", () => {
    it("saves after adding a card", async () => {
      await renderBoard();
      const column = getFirstColumn();
      await userEvent.click(
        within(column).getByRole("button", { name: /add a card/i })
      );
      await userEvent.type(
        within(column).getByPlaceholderText(/card title/i),
        "Saved card"
      );
      await userEvent.click(
        within(column).getByRole("button", { name: /add card/i })
      );

      await waitFor(() => expect(savesMade()).toBe(1));
      const saved = lastSavedBoard();
      expect(
        Object.values(saved.cards).some((card) => card.title === "Saved card")
      ).toBe(true);
    });

    it("saves after deleting a card", async () => {
      await renderBoard();
      await userEvent.click(
        screen.getByRole("button", { name: /delete align roadmap themes/i })
      );

      await waitFor(() => expect(savesMade()).toBe(1));
      expect(lastSavedBoard().cards["card-1"]).toBeUndefined();
    });

    it("saves after editing a card", async () => {
      await renderBoard();
      await userEvent.click(
        screen.getByRole("button", { name: /edit align roadmap themes/i })
      );

      const title = screen.getByLabelText("Card title");
      await userEvent.clear(title);
      await userEvent.type(title, "Edited title");
      const details = screen.getByLabelText("Card details");
      await userEvent.clear(details);
      await userEvent.type(details, "Edited details");
      await userEvent.click(screen.getByRole("button", { name: /save card/i }));

      await waitFor(() => expect(savesMade()).toBe(1));
      expect(lastSavedBoard().cards["card-1"]).toEqual({
        id: "card-1",
        title: "Edited title",
        details: "Edited details",
      });
    });

    it("shows the edit on the board", async () => {
      await renderBoard();
      await userEvent.click(
        screen.getByRole("button", { name: /edit align roadmap themes/i })
      );
      const title = screen.getByLabelText("Card title");
      await userEvent.clear(title);
      await userEvent.type(title, "Now renamed");
      await userEvent.click(screen.getByRole("button", { name: /save card/i }));

      expect(screen.getByText("Now renamed")).toBeInTheDocument();
      expect(screen.queryByText("Align roadmap themes")).not.toBeInTheDocument();
    });

    it("cancels an edit without saving", async () => {
      await renderBoard();
      await userEvent.click(
        screen.getByRole("button", { name: /edit align roadmap themes/i })
      );
      await userEvent.type(screen.getByLabelText("Card title"), " changed");
      await userEvent.click(screen.getByRole("button", { name: /cancel/i }));

      expect(screen.getByText("Align roadmap themes")).toBeInTheDocument();
      expect(savesMade()).toBe(0);
    });

    it("does not save an edit with a blank title", async () => {
      await renderBoard();
      await userEvent.click(
        screen.getByRole("button", { name: /edit align roadmap themes/i })
      );
      await userEvent.clear(screen.getByLabelText("Card title"));
      await userEvent.click(screen.getByRole("button", { name: /save card/i }));

      expect(savesMade()).toBe(0);
    });

    it("shows an error when a save fails", async () => {
      await renderBoard();
      fetchMock.mockImplementation(() => Promise.resolve(jsonResponse(422, {})));

      await userEvent.click(
        screen.getByRole("button", { name: /delete align roadmap themes/i })
      );

      expect(await screen.findByTestId("board-error")).toHaveTextContent(
        /could not save your changes/i
      );
    });

    it("clears the error once a later save succeeds", async () => {
      await renderBoard();
      fetchMock.mockImplementationOnce(() => Promise.resolve(jsonResponse(500, {})));
      await userEvent.click(
        screen.getByRole("button", { name: /delete align roadmap themes/i })
      );
      expect(await screen.findByTestId("board-error")).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole("button", { name: /delete gather customer signals/i })
      );

      await waitFor(() =>
        expect(screen.queryByTestId("board-error")).not.toBeInTheDocument()
      );
    });
  });

  describe("column rename", () => {
    it("updates the column immediately", async () => {
      await renderBoard();
      const input = within(getFirstColumn()).getByLabelText(/^column title/i);
      await userEvent.clear(input);
      await userEvent.type(input, "New Name");
      expect(input).toHaveValue("New Name");
    });

    it("debounces typing into a single save", async () => {
      await renderBoard();
      const input = within(getFirstColumn()).getByLabelText(/^column title/i);

      await userEvent.clear(input);
      await userEvent.type(input, "Renamed");
      expect(savesMade()).toBe(0);

      await waitFor(() => expect(savesMade()).toBe(1), { timeout: 2000 });
      expect(lastSavedBoard().columns[0].title).toBe("Renamed");
    });

    it("does not put back a change made while the rename was waiting", async () => {
      await renderBoard();
      await userEvent.type(
        within(getFirstColumn()).getByLabelText(/^column title/i),
        "!"
      );

      // Inside the debounce window. This saves at once, and the waiting rename must
      // not follow it with the board as it was before the delete.
      await userEvent.click(
        screen.getByRole("button", { name: /delete align roadmap themes/i })
      );
      await waitFor(() => expect(savesMade()).toBe(1));
      await afterTheRenameDelay();

      expect(savesMade()).toBe(1);
      expect(lastSavedBoard().cards["card-1"]).toBeUndefined();
      expect(lastSavedBoard().columns[0].title).toBe("Backlog!");
    });

    it("saves a rename that was still waiting when the board unmounts", async () => {
      const view = await renderBoard();
      await userEvent.type(
        within(getFirstColumn()).getByLabelText(/^column title/i),
        "!"
      );
      expect(savesMade()).toBe(0);

      view.unmount();

      await waitFor(() => expect(savesMade()).toBe(1));
      expect(lastSavedBoard().columns[0].title).toBe("Backlog!");
    });

    it("never saves a board with a blank column title", async () => {
      await renderBoard();
      const input = within(getFirstColumn()).getByLabelText(/^column title/i);
      await userEvent.clear(input);
      expect(input).toHaveValue("");

      await userEvent.click(
        screen.getByRole("button", { name: /delete align roadmap themes/i })
      );

      // The API refuses a blank title, and a board holding one could never be saved
      // again, so the board keeps the last usable title.
      await waitFor(() => expect(savesMade()).toBe(1));
      expect(lastSavedBoard().columns[0].title).toBe("Backlog");
    });

    it("puts the title back when the field is left blank", async () => {
      await renderBoard();
      const input = within(getFirstColumn()).getByLabelText(/^column title/i);
      await userEvent.clear(input);
      await userEvent.tab();

      expect(input).toHaveValue("Backlog");
    });
  });

  it("updates the card count when a card is added", async () => {
    await renderBoard();
    const column = getFirstColumn();
    expect(within(column).getByText("2 cards")).toBeInTheDocument();

    await userEvent.click(
      within(column).getByRole("button", { name: /add a card/i })
    );
    await userEvent.type(
      within(column).getByPlaceholderText(/card title/i),
      "Counted"
    );
    await userEvent.click(
      within(column).getByRole("button", { name: /add card/i })
    );

    expect(within(column).getByText("3 cards")).toBeInTheDocument();
  });

  it("falls back to placeholder details when none are given", async () => {
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: /add a card/i })
    );
    await userEvent.type(
      within(column).getByPlaceholderText(/card title/i),
      "No details card"
    );
    await userEvent.click(
      within(column).getByRole("button", { name: /add card/i })
    );

    expect(within(column).getByText("No details yet.")).toBeInTheDocument();

    // Shown, not stored: the AI never writes it, so storing it would make two
    // identical empty cards read differently depending on which one created them.
    await waitFor(() => expect(savesMade()).toBe(1));
    const added = Object.values(lastSavedBoard().cards).find(
      (card) => card.title === "No details card"
    );
    expect(added?.details).toBe("");
  });

  it("does not add a card when the title is only whitespace", async () => {
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: /add a card/i })
    );
    await userEvent.type(within(column).getByPlaceholderText(/card title/i), "   ");
    await userEvent.click(
      within(column).getByRole("button", { name: /add card/i })
    );

    expect(within(column).getByText("2 cards")).toBeInTheDocument();
    expect(savesMade()).toBe(0);
  });

  it("puts the drag listeners on their own handle, not on the card", async () => {
    await renderBoard();
    const card = screen.getByTestId("card-card-1");

    expect(card).not.toHaveAttribute("role", "button");
    expect(
      within(card).getByRole("button", { name: /^drag align roadmap themes/i })
    ).toBeInTheDocument();
  });

  it("deletes only the card asked for", async () => {
    await renderBoard();
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: /delete align roadmap themes/i })
    );

    expect(within(column).queryByText("Align roadmap themes")).not.toBeInTheDocument();
    expect(within(column).getByText("Gather customer signals")).toBeInTheDocument();
  });

  describe("ai chat", () => {
    const withCard: BoardData = {
      ...initialData,
      columns: initialData.columns.map((column, index) =>
        index === 0
          ? { ...column, cardIds: [...column.cardIds, "card-9"] }
          : column
      ),
      cards: {
        ...initialData.cards,
        "card-9": { id: "card-9", title: "Buy milk", details: "From the shop" },
      },
    };

    /** Mocked by URL, not by call order: the board is fetched on mount. */
    const renderWithChat = async (reply: string, board: BoardData | null) => {
      fetchMock = vi.fn((input: unknown, init?: RequestInit) => {
        if (String(input) === "/api/chat") {
          return Promise.resolve(jsonResponse(200, { reply, board }));
        }
        if (init?.method === "PUT") {
          return Promise.resolve(jsonResponse(200, JSON.parse(init.body as string)));
        }
        return Promise.resolve(jsonResponse(200, initialData));
      });
      vi.stubGlobal("fetch", fetchMock);
      render(<KanbanBoard {...boardShellProps} />);
      await screen.findByTestId("column-col-backlog");
    };

    /** The chat panel starts closed, so open it before asking anything. */
    const ask = async (text: string) => {
      await userEvent.click(screen.getByTestId("chat-open"));
      await userEvent.type(screen.getByLabelText("Message the assistant"), text);
      await userEvent.click(screen.getByRole("button", { name: "Send" }));
    };

    it("shows the board the assistant returned", async () => {
      await renderWithChat("Added it.", withCard);

      await ask("Add a card called Buy milk");

      expect(await screen.findByText("Buy milk")).toBeInTheDocument();
      expect(within(getFirstColumn()).getByText("3 cards")).toBeInTheDocument();
    });

    it("scopes the chat request to the open board", async () => {
      await renderWithChat("Added it.", withCard);

      await ask("Add a card called Buy milk");
      await screen.findByText("Buy milk");

      const chatCall = fetchMock.mock.calls.find(
        ([input]) => String(input) === "/api/chat"
      );
      const body = JSON.parse((chatCall?.[1] as RequestInit).body as string);
      expect(body.board_id).toBe(1);
    });

    it("does not save a board the assistant already stored", async () => {
      await renderWithChat("Added it.", withCard);

      await ask("Add a card called Buy milk");

      await screen.findByText("Buy milk");
      expect(savesMade()).toBe(0);
    });

    it("leaves the board alone when the assistant changed nothing", async () => {
      await renderWithChat("There are eight cards.", null);

      await ask("How many cards?");

      expect(await screen.findByTestId("chat-assistant")).toBeInTheDocument();
      expect(screen.queryByText("Buy milk")).not.toBeInTheDocument();
      expect(within(getFirstColumn()).getByText("2 cards")).toBeInTheDocument();
    });

    it("drops a pending rename when the assistant's board arrives first", async () => {
      await renderWithChat("Added it.", withCard);

      await userEvent.type(
        within(getFirstColumn()).getByLabelText(/^column title/i),
        "!"
      );
      expect(savesMade()).toBe(0);

      // Typed without the default per-keystroke delay: the rename's debounce timer is
      // already running, and this must land well inside its 500ms window to be a real
      // test of the interleaving rather than a race against typing speed.
      await userEvent.click(screen.getByTestId("chat-open"));
      await userEvent.type(
        screen.getByLabelText("Message the assistant"),
        "Add a card called Buy milk",
        { delay: null }
      );
      await userEvent.click(screen.getByRole("button", { name: "Send" }));
      await screen.findByText("Buy milk");

      await afterTheRenameDelay();

      expect(savesMade()).toBe(0);
    });
  });
});
