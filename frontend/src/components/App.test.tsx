import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "@/components/App";
import { initialData } from "@/lib/kanban";

const jsonResponse = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Routes by URL rather than call order, because the board component fetches
 * /api/board on its own as soon as it mounts.
 */
const mockFetch = (session: { status: number; body?: unknown } | "reject") => {
  const fetchMock = vi.fn((input: unknown, init?: RequestInit) => {
    const url = String(input);
    if (url === "/api/board") {
      return Promise.resolve(
        jsonResponse(200, init?.method === "PUT" ? JSON.parse(init.body as string) : initialData)
      );
    }
    if (url === "/api/auth/me") {
      return session === "reject"
        ? Promise.reject(new Error("offline"))
        : Promise.resolve(jsonResponse(session.status, session.body ?? {}));
    }
    return Promise.resolve(jsonResponse(200, { username: "user" }));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("App", () => {
  it("shows the login form when there is no session", async () => {
    mockFetch({ status: 401, body: { detail: "Not signed in" } });

    render(<App />);

    expect(await screen.findByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /kanban studio/i })).toBeInTheDocument();
    expect(screen.queryByTestId("column-col-backlog")).not.toBeInTheDocument();
  });

  it("shows the board when a session already exists", async () => {
    mockFetch({ status: 200, body: { username: "user" } });

    render(<App />);

    expect(await screen.findByTestId("column-col-backlog")).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  it("checks the session against /api/auth/me on load", async () => {
    const fetchMock = mockFetch({ status: 401 });

    render(<App />);
    await screen.findByLabelText(/username/i);

    expect(fetchMock).toHaveBeenCalledWith("/api/auth/me");
  });

  it("signs in and reveals the board", async () => {
    const fetchMock = mockFetch({ status: 401 });

    render(<App />);
    await userEvent.type(await screen.findByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByTestId("column-col-backlog")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "user", password: "password" }),
    });
  });

  it("shows an error when the credentials are rejected", async () => {
    const fetchMock = mockFetch({ status: 401 });
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(jsonResponse(401, {}))
    );
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(jsonResponse(401, { detail: "Invalid" }))
    );

    render(<App />);
    await userEvent.type(await screen.findByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /invalid username or password/i
    );
    expect(screen.queryByTestId("column-col-backlog")).not.toBeInTheDocument();
  });

  it("keeps the user on the login form after a failed attempt", async () => {
    const fetchMock = mockFetch({ status: 401 });
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve(jsonResponse(401, {}))
    );
    fetchMock.mockImplementationOnce(() => Promise.resolve(jsonResponse(500, {})));

    render(<App />);
    await userEvent.type(await screen.findByLabelText(/username/i), "user");
    await userEvent.type(screen.getByLabelText(/password/i), "password");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not sign in/i);
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
  });

  it("signs out and returns to the login form", async () => {
    const fetchMock = mockFetch({ status: 200, body: { username: "user" } });

    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: /sign out/i }));

    expect(await screen.findByLabelText(/username/i)).toBeInTheDocument();
    expect(screen.queryByTestId("column-col-backlog")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/auth/logout", {
      method: "POST",
    });
  });

  it("shows the signed in username on the board", async () => {
    mockFetch({ status: 200, body: { username: "user" } });

    render(<App />);

    const header = await screen.findByRole("banner");
    expect(header).toHaveTextContent("user");
  });

  it("falls back to the login form when the session check fails", async () => {
    mockFetch("reject");

    render(<App />);

    expect(await screen.findByLabelText(/username/i)).toBeInTheDocument();
  });

  it("shows a loading state while the session is being checked", async () => {
    const fetchMock = mockFetch({ status: 401 });
    let resolve: (value: Response) => void = () => {};
    fetchMock.mockImplementationOnce(
      () =>
        new Promise<Response>((r) => {
          resolve = r;
        })
    );

    render(<App />);
    expect(screen.getByRole("status")).toHaveTextContent(/loading/i);

    resolve(jsonResponse(401, {}));
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument()
    );
  });
});
