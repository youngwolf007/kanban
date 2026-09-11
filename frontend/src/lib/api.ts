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

export const register = async (
  username: string,
  password: string
): Promise<Session> => {
  const response = await fetch("/api/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (response.status === 409) {
    throw new Error("That username is taken.");
  }
  if (!response.ok) {
    throw new Error("Could not create your account. Try again.");
  }
  return response.json();
};

export const logout = async (): Promise<void> => {
  const response = await fetch("/api/auth/logout", { method: "POST" });
  if (!response.ok) {
    throw new Error("Could not sign out.");
  }
};

export type BoardSummary = {
  id: number;
  name: string;
  updatedAt: string;
};

export const listBoards = async (): Promise<BoardSummary[]> => {
  const response = await fetch("/api/boards");
  if (!response.ok) {
    throw new Error("Could not load your boards.");
  }
  return response.json();
};

export const createBoard = async (name?: string): Promise<BoardSummary> => {
  const response = await fetch("/api/boards", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(name ? { name } : {}),
  });
  if (!response.ok) {
    throw new Error("Could not create a board.");
  }
  return response.json();
};

export const renameBoard = async (
  boardId: number,
  name: string
): Promise<BoardSummary> => {
  const response = await fetch(`/api/boards/${boardId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!response.ok) {
    throw new Error("Could not rename the board.");
  }
  return response.json();
};

export const deleteBoard = async (boardId: number): Promise<void> => {
  const response = await fetch(`/api/boards/${boardId}`, { method: "DELETE" });
  if (!response.ok) {
    throw new Error("Could not delete the board.");
  }
};

export const getBoard = async (boardId: number): Promise<BoardData> => {
  const response = await fetch(`/api/boards/${boardId}`);
  if (!response.ok) {
    throw new Error("Could not load your board.");
  }
  return response.json();
};

export const saveBoard = async (
  boardId: number,
  board: BoardData
): Promise<BoardData> => {
  const response = await fetch(`/api/boards/${boardId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(board),
  });
  if (!response.ok) {
    throw new Error("Could not save your changes.");
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
  boardId: number,
  message: string,
  history: ChatMessage[]
): Promise<ChatReply> => {
  const response = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ board_id: boardId, message, history }),
  });
  if (!response.ok) {
    throw new Error("The assistant could not answer.");
  }
  return response.json();
};
