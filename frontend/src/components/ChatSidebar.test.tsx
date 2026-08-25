import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChatSidebar } from "@/components/ChatSidebar";
import type { BoardData } from "@/lib/kanban";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** A fresh Response per call: a body can only be read once. */
const chatReturning = (reply: string, board: BoardData | null = null) =>
  vi.fn(() => Promise.resolve(jsonResponse(200, { reply, board })));

/** The panel starts closed, so every test opens it first. */
const renderSidebar = async (onBoardChange = vi.fn()) => {
  render(<ChatSidebar onBoardChange={onBoardChange} />);
  await userEvent.click(screen.getByTestId("chat-open"));
  return onBoardChange;
};

const send = async (user: ReturnType<typeof userEvent.setup>, text: string) => {
  await user.type(screen.getByLabelText("Message the assistant"), text);
  await user.click(screen.getByRole("button", { name: "Send" }));
};

/** The body of the most recent POST /api/chat. */
const lastChatRequest = (mock: ReturnType<typeof vi.fn>) => {
  const init = mock.mock.calls.at(-1)?.[1] as RequestInit;
  return JSON.parse(init.body as string);
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ChatSidebar", () => {
  it("renders the composer", async () => {
    await renderSidebar();

    expect(screen.getByTestId("chat-sidebar")).toBeInTheDocument();
    expect(screen.getByLabelText("Message the assistant")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  it("sends the message and shows the reply", async () => {
    const user = userEvent.setup();
    const fetchMock = chatReturning("There are eight cards.");
    vi.stubGlobal("fetch", fetchMock);
    await renderSidebar();

    await send(user, "How many cards?");

    expect(await screen.findByTestId("chat-assistant")).toHaveTextContent(
      "There are eight cards."
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/chat", expect.anything());
    expect(lastChatRequest(fetchMock).message).toBe("How many cards?");
  });

  it("shows the user's own message", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", chatReturning("Sure."));
    await renderSidebar();

    await send(user, "How many cards?");

    expect(screen.getByTestId("chat-user")).toHaveTextContent("How many cards?");
  });

  it("clears the composer after sending", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", chatReturning("Sure."));
    await renderSidebar();

    await send(user, "How many cards?");

    await waitFor(() =>
      expect(screen.getByLabelText("Message the assistant")).toHaveValue("")
    );
  });

  it("sends the earlier conversation as history", async () => {
    const user = userEvent.setup();
    const fetchMock = chatReturning("Done.");
    vi.stubGlobal("fetch", fetchMock);
    await renderSidebar();

    await send(user, "Add a card");
    await screen.findByTestId("chat-assistant");
    await send(user, "Now move it");

    await waitFor(() =>
      expect(lastChatRequest(fetchMock).history).toEqual([
        { role: "user", content: "Add a card" },
        { role: "assistant", content: "Done." },
      ])
    );
    expect(lastChatRequest(fetchMock).message).toBe("Now move it");
  });

  it("shows a pending state while waiting, then clears it", async () => {
    const user = userEvent.setup();
    let release: (value: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((resolve) => (release = resolve)))
    );
    await renderSidebar();

    await send(user, "How many cards?");
    expect(screen.getByTestId("chat-pending")).toBeInTheDocument();

    release(jsonResponse(200, { reply: "Eight.", board: null }));

    await waitFor(() =>
      expect(screen.queryByTestId("chat-pending")).not.toBeInTheDocument()
    );
  });

  it("refreshes the board when the reply carries one", async () => {
    const user = userEvent.setup();
    const board: BoardData = {
      columns: [{ id: "col-a", title: "Backlog", cardIds: ["card-9"] }],
      cards: { "card-9": { id: "card-9", title: "Buy milk", details: "." } },
    };
    vi.stubGlobal("fetch", chatReturning("Added it.", board));
    const onBoardChange = await renderSidebar();

    await send(user, "Add Buy milk");

    await waitFor(() => expect(onBoardChange).toHaveBeenCalledWith(board));
  });

  it("leaves the board alone when the reply carries none", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", chatReturning("There are eight cards.", null));
    const onBoardChange = await renderSidebar();

    await send(user, "How many cards?");

    await screen.findByTestId("chat-assistant");
    expect(onBoardChange).not.toHaveBeenCalled();
  });

  it("shows an error when the request fails", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(502, {})));
    await renderSidebar();

    await send(user, "Add a card");

    expect(await screen.findByTestId("chat-error")).toHaveTextContent(
      /could not answer/i
    );
    expect(screen.queryByTestId("chat-pending")).not.toBeInTheDocument();
  });

  it("starts closed and opens on request", async () => {
    render(<ChatSidebar onBoardChange={vi.fn()} />);

    expect(screen.queryByTestId("chat-sidebar")).not.toBeInTheDocument();

    await userEvent.click(screen.getByTestId("chat-open"));
    expect(screen.getByTestId("chat-sidebar")).toBeInTheDocument();
  });

  it("collapses and reopens", async () => {
    const user = userEvent.setup();
    await renderSidebar();

    await user.click(screen.getByTestId("chat-close"));
    expect(screen.queryByTestId("chat-sidebar")).not.toBeInTheDocument();

    await user.click(screen.getByTestId("chat-open"));
    expect(screen.getByTestId("chat-sidebar")).toBeInTheDocument();
  });

  it("does not send a blank message", async () => {
    const user = userEvent.setup();
    const fetchMock = chatReturning("Sure.");
    vi.stubGlobal("fetch", fetchMock);
    await renderSidebar();

    await user.type(screen.getByLabelText("Message the assistant"), "   ");

    expect(screen.getByRole("button", { name: "Send" })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
