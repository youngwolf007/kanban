import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Workspace } from "@/components/Workspace";
import { initialData } from "@/lib/kanban";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const boardSummary = (id: number, name: string) => ({
  id,
  name,
  updatedAt: "2026-01-01T00:00:00Z",
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Workspace", () => {
  it("creates a first board when the user has none yet", async () => {
    const fetchMock = vi.fn((input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/boards" && init?.method === "POST") {
        return Promise.resolve(jsonResponse(201, boardSummary(1, "New board")));
      }
      if (url === "/api/boards") {
        return Promise.resolve(jsonResponse(200, []));
      }
      return Promise.resolve(jsonResponse(200, initialData));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Workspace username="user" onSignOut={vi.fn()} />);

    expect(await screen.findByTestId("column-col-backlog")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/boards",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("opens straight onto an existing board", async () => {
    const fetchMock = vi.fn((input: unknown) => {
      const url = String(input);
      if (url === "/api/boards") {
        return Promise.resolve(jsonResponse(200, [boardSummary(7, "Roadmap")]));
      }
      return Promise.resolve(jsonResponse(200, initialData));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Workspace username="user" onSignOut={vi.fn()} />);

    expect(await screen.findByTestId("board-switcher")).toHaveTextContent("Roadmap");
    expect(fetchMock).toHaveBeenCalledWith("/api/boards/7");
  });

  it("switches to another board", async () => {
    const fetchMock = vi.fn((input: unknown) => {
      const url = String(input);
      if (url === "/api/boards") {
        return Promise.resolve(
          jsonResponse(200, [boardSummary(1, "First"), boardSummary(2, "Second")])
        );
      }
      if (url === "/api/boards/2") {
        return Promise.resolve(
          jsonResponse(200, {
            columns: [{ id: "col-x", title: "Only column", cardIds: [] }],
            cards: {},
          })
        );
      }
      return Promise.resolve(jsonResponse(200, initialData));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Workspace username="user" onSignOut={vi.fn()} />);
    await screen.findByTestId("column-col-backlog");

    await userEvent.click(screen.getByTestId("board-switcher"));
    await userEvent.click(screen.getByText("Second"));

    expect(await screen.findByTestId("column-col-x")).toBeInTheDocument();
    expect(screen.getByTestId("board-switcher")).toHaveTextContent("Second");
  });

  it("creates a board and switches to it", async () => {
    const fetchMock = vi.fn((input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/boards" && init?.method === "POST") {
        return Promise.resolve(jsonResponse(201, boardSummary(2, "New board")));
      }
      if (url === "/api/boards") {
        return Promise.resolve(jsonResponse(200, [boardSummary(1, "First")]));
      }
      return Promise.resolve(jsonResponse(200, initialData));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Workspace username="user" onSignOut={vi.fn()} />);
    await screen.findByTestId("column-col-backlog");

    await userEvent.click(screen.getByTestId("board-switcher"));
    await userEvent.click(screen.getByTestId("board-create"));

    await waitFor(() =>
      expect(screen.getByTestId("board-switcher")).toHaveTextContent("New board")
    );
  });

  it("renames a board in place", async () => {
    const fetchMock = vi.fn((input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/boards/1" && init?.method === "PATCH") {
        return Promise.resolve(jsonResponse(200, boardSummary(1, "Renamed")));
      }
      if (url === "/api/boards") {
        return Promise.resolve(jsonResponse(200, [boardSummary(1, "First")]));
      }
      return Promise.resolve(jsonResponse(200, initialData));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Workspace username="user" onSignOut={vi.fn()} />);
    await screen.findByTestId("column-col-backlog");

    await userEvent.click(screen.getByTestId("board-switcher"));
    await userEvent.click(screen.getByLabelText("Rename First"));
    const input = screen.getByLabelText("New name for First");
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed{Enter}");

    await waitFor(() =>
      expect(screen.getByTestId("board-switcher")).toHaveTextContent("Renamed")
    );
  });

  it("deletes a board and switches to what remains", async () => {
    const fetchMock = vi.fn((input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/boards/1" && init?.method === "DELETE") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (url === "/api/boards") {
        return Promise.resolve(
          jsonResponse(200, [boardSummary(1, "First"), boardSummary(2, "Second")])
        );
      }
      return Promise.resolve(jsonResponse(200, initialData));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Workspace username="user" onSignOut={vi.fn()} />);
    await screen.findByTestId("column-col-backlog");

    await userEvent.click(screen.getByTestId("board-switcher"));
    await userEvent.click(screen.getByLabelText("Delete First"));

    await waitFor(() =>
      expect(screen.getByTestId("board-switcher")).toHaveTextContent("Second")
    );
  });

  it("recreates a board after deleting the only one", async () => {
    let created = false;
    const fetchMock = vi.fn((input: unknown, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/boards/1" && init?.method === "DELETE") {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (url === "/api/boards" && init?.method === "POST") {
        created = true;
        return Promise.resolve(jsonResponse(201, boardSummary(2, "New board")));
      }
      if (url === "/api/boards") {
        return Promise.resolve(
          jsonResponse(200, created ? [] : [boardSummary(1, "First")])
        );
      }
      return Promise.resolve(jsonResponse(200, initialData));
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<Workspace username="user" onSignOut={vi.fn()} />);
    await screen.findByTestId("column-col-backlog");

    await userEvent.click(screen.getByTestId("board-switcher"));
    await userEvent.click(screen.getByLabelText("Delete First"));

    await waitFor(() =>
      expect(screen.getByTestId("board-switcher")).toHaveTextContent("New board")
    );
  });

  it("shows an error when the board list cannot be loaded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(500, {})));

    render(<Workspace username="user" onSignOut={vi.fn()} />);

    expect(await screen.findByTestId("board-error")).toHaveTextContent(
      /could not load your boards/i
    );
  });

  it("passes the username and sign out handler through to the board", async () => {
    const fetchMock = vi.fn((input: unknown) => {
      const url = String(input);
      if (url === "/api/boards") {
        return Promise.resolve(jsonResponse(200, [boardSummary(1, "First")]));
      }
      return Promise.resolve(jsonResponse(200, initialData));
    });
    vi.stubGlobal("fetch", fetchMock);
    const onSignOut = vi.fn();

    render(<Workspace username="atif" onSignOut={onSignOut} />);
    await screen.findByTestId("column-col-backlog");

    const header = screen.getByRole("banner");
    expect(within(header).getByText("atif")).toBeInTheDocument();

    await userEvent.click(within(header).getByRole("button", { name: /sign out/i }));
    expect(onSignOut).toHaveBeenCalled();
  });
});
