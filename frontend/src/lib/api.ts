import type { BoardData } from "@/lib/kanban";

export type Session = {
  username: string;
};

export const getSession = async (): Promise<Session | null> => {
  const response = await fetch("/api/auth/me");
  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error("Could not check the session.");
  }
  return response.json();
};

export const login = async (
  username: string,
  password: string
): Promise<Session> => {
  const response = await fetch("/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (response.status === 401) {
    throw new Error("Invalid username or password.");
  }
  if (!response.ok) {
    throw new Error("Could not sign in. Try again.");
  }
  return response.json();
};

export const logout = async (): Promise<void> => {
  const response = await fetch("/api/auth/logout", { method: "POST" });
  if (!response.ok) {
    throw new Error("Could not sign out.");
  }
};

export const getBoard = async (): Promise<BoardData> => {
  const response = await fetch("/api/board");
  if (!response.ok) {
    throw new Error("Could not load your board.");
  }
  return response.json();
};

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatReply = {
  reply: string;
  /** Set only when the AI changed the board. The backend has already stored it. */
  board: BoardData | null;
};

export const sendChat = async (
  message: string,
  history: ChatMessage[]
): Promise<ChatReply> => {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message, history }),
  });
  if (!response.ok) {
    throw new Error("The assistant could not answer.");
  }
  return response.json();
};

export const saveBoard = async (board: BoardData): Promise<BoardData> => {
  const response = await fetch("/api/board", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(board),
  });
  if (!response.ok) {
    throw new Error("Could not save your changes.");
  }
  return response.json();
};
