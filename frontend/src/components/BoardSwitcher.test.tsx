import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoardSwitcher } from "@/components/BoardSwitcher";
import type { BoardSummary } from "@/lib/api";

// A 204 Response cannot carry a body, hence the special case rather than always
// JSON.stringify-ing, which would throw for the DELETE responses in these tests.
const jsonResponse = (status: number, body: unknown) =>
  status === 204
    ? new Response(null, { status })
    : new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });

const boards: BoardSummary[] = [
  {
    id: 1,
    name: "Roadmap",
    updatedAt: "2026-01-02T00:00:00Z",
    isOwner: true,
    ownerUsername: "user",
  },
  {
    id: 2,
    name: "Personal",
    updatedAt: "2026-01-01T00:00:00Z",
    isOwner: true,
    ownerUsername: "user",
  },
];

const renderSwitcher = (overrides: Partial<Parameters<typeof BoardSwitcher>[0]> = {}) => {
  const props = {
    boards,
    currentBoardId: 1,
    onSwitch: vi.fn(),
    onCreate: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onLeave: vi.fn(),
    ...overrides,
  };
  render(<BoardSwitcher {...props} />);
  return props;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("BoardSwitcher", () => {
  it("shows the current board's name on the trigger", () => {
    renderSwitcher();
    expect(screen.getByTestId("board-switcher")).toHaveTextContent("Roadmap");
  });

  it("opens to list every board", async () => {
    renderSwitcher();
    await userEvent.click(screen.getByTestId("board-switcher"));

    expect(screen.getByTestId("board-menu")).toBeInTheDocument();
    expect(screen.getByTestId("board-option-1")).toHaveTextContent("Roadmap");
    expect(screen.getByTestId("board-option-2")).toHaveTextContent("Personal");
  });

  it("switches to the clicked board and closes the menu", async () => {
    const props = renderSwitcher();
    await userEvent.click(screen.getByTestId("board-switcher"));
    await userEvent.click(screen.getByText("Personal"));

    expect(props.onSwitch).toHaveBeenCalledWith(2);
    expect(screen.queryByTestId("board-menu")).not.toBeInTheDocument();
  });

  it("creates a new board", async () => {
    const props = renderSwitcher();
    await userEvent.click(screen.getByTestId("board-switcher"));
    await userEvent.click(screen.getByTestId("board-create"));

    expect(props.onCreate).toHaveBeenCalled();
  });

  it("renames a board", async () => {
    const props = renderSwitcher();
    await userEvent.click(screen.getByTestId("board-switcher"));
    await userEvent.click(screen.getByLabelText("Rename Roadmap"));

    const input = screen.getByLabelText("New name for Roadmap");
    await userEvent.clear(input);
    await userEvent.type(input, "Q1 plan{Enter}");

    expect(props.onRename).toHaveBeenCalledWith(1, "Q1 plan");
  });

  it("does not rename to a blank name", async () => {
    const props = renderSwitcher();
    await userEvent.click(screen.getByTestId("board-switcher"));
    await userEvent.click(screen.getByLabelText("Rename Roadmap"));
    await userEvent.clear(screen.getByLabelText("New name for Roadmap"));
    await userEvent.keyboard("{Enter}");

    expect(props.onRename).not.toHaveBeenCalled();
  });

  it("deletes a board", async () => {
    const props = renderSwitcher();
    await userEvent.click(screen.getByTestId("board-switcher"));
    await userEvent.click(screen.getByLabelText("Delete Personal"));

    expect(props.onDelete).toHaveBeenCalledWith(2);
  });

  describe("sharing", () => {
    it("shows who a board not owned by the user is shared by, with no rename or delete", async () => {
      renderSwitcher({
        boards: [
          { ...boards[0], isOwner: false, ownerUsername: "alice" },
          boards[1],
        ],
      });
      await userEvent.click(screen.getByTestId("board-switcher"));

      const option = screen.getByTestId("board-option-1");
      expect(option).toHaveTextContent("Shared by alice");
      expect(screen.queryByLabelText("Rename Roadmap")).not.toBeInTheDocument();
      expect(screen.queryByLabelText("Delete Roadmap")).not.toBeInTheDocument();
    });

    it("leaves a shared board", async () => {
      const props = renderSwitcher({
        boards: [{ ...boards[0], isOwner: false, ownerUsername: "alice" }, boards[1]],
      });
      await userEvent.click(screen.getByTestId("board-switcher"));
      await userEvent.click(screen.getByLabelText("Leave Roadmap"));

      expect(props.onLeave).toHaveBeenCalledWith(1);
    });

    it("loads and lists members when Share is opened", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(jsonResponse(200, [{ userId: 2, username: "alice" }]))
      );
      renderSwitcher();
      await userEvent.click(screen.getByTestId("board-switcher"));
      await userEvent.click(screen.getByLabelText("Share Roadmap"));

      expect(await screen.findByText("alice")).toBeInTheDocument();
      expect(global.fetch).toHaveBeenCalledWith("/api/boards/1/members");
    });

    it("invites a member by username", async () => {
      const fetchMock = vi.fn((input: unknown, init?: RequestInit) => {
        if (init?.method === "POST") {
          return Promise.resolve(
            jsonResponse(201, [{ userId: 2, username: "alice" }])
          );
        }
        return Promise.resolve(jsonResponse(200, []));
      });
      vi.stubGlobal("fetch", fetchMock);
      renderSwitcher();
      await userEvent.click(screen.getByTestId("board-switcher"));
      await userEvent.click(screen.getByLabelText("Share Roadmap"));
      await screen.findByText("Only you have access.");

      await userEvent.type(
        screen.getByLabelText("Invite a member to Roadmap"),
        "alice{Enter}"
      );

      expect(await screen.findByText("alice")).toBeInTheDocument();
    });

    it("shows an error when inviting an unknown username", async () => {
      const fetchMock = vi.fn((input: unknown, init?: RequestInit) => {
        if (init?.method === "POST") {
          return Promise.resolve(jsonResponse(404, {}));
        }
        return Promise.resolve(jsonResponse(200, []));
      });
      vi.stubGlobal("fetch", fetchMock);
      renderSwitcher();
      await userEvent.click(screen.getByTestId("board-switcher"));
      await userEvent.click(screen.getByLabelText("Share Roadmap"));
      await screen.findByText("Only you have access.");

      await userEvent.type(
        screen.getByLabelText("Invite a member to Roadmap"),
        "ghost{Enter}"
      );

      expect(await screen.findByRole("alert")).toHaveTextContent(
        /no user with that username/i
      );
    });

    it("removes a member", async () => {
      const fetchMock = vi.fn((input: unknown, init?: RequestInit) => {
        const url = String(input);
        if (url === "/api/boards/1/members" && !init) {
          return Promise.resolve(
            jsonResponse(200, [{ userId: 2, username: "alice" }])
          );
        }
        return Promise.resolve(jsonResponse(204, null));
      });
      vi.stubGlobal("fetch", fetchMock);
      renderSwitcher();
      await userEvent.click(screen.getByTestId("board-switcher"));
      await userEvent.click(screen.getByLabelText("Share Roadmap"));
      await screen.findByText("alice");

      await userEvent.click(screen.getByLabelText("Remove alice from Roadmap"));

      await waitFor(() =>
        expect(screen.queryByText("alice")).not.toBeInTheDocument()
      );
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/boards/1/members/2",
        expect.objectContaining({ method: "DELETE" })
      );
    });
  });
});
