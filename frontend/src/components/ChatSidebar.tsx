"use client";

import { useEffect, useRef, useState } from "react";
import { sendChat, type ChatMessage } from "@/lib/api";
import type { BoardData } from "@/lib/kanban";

type ChatSidebarProps = {
  boardId: number;
  onBoardChange: (board: BoardData) => void;
};

export const ChatSidebar = ({ boardId, onBoardChange }: ChatSidebarProps) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Closed by default: five columns need the whole width, so the panel overlays the
  // board rather than sharing the row with it. See frontend/AGENTS.md.
  const [isOpen, setIsOpen] = useState(false);
  const transcript = useRef<HTMLDivElement>(null);

  // The conversation is scoped to one board; switching boards starts a fresh one
  // rather than sending another board's history as this board's context.
  useEffect(() => {
    setMessages([]);
    setDraft("");
    setError(null);
  }, [boardId]);

  // Keep the newest message in view. scrollTop rather than scrollTo, which jsdom lacks.
  useEffect(() => {
    const node = transcript.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [messages, isPending]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const message = draft.trim();
    if (!message || isPending) {
      return;
    }

    // The history sent is the conversation before this message, which is what the
    // backend expects; the new message travels separately.
    const history = messages;
    setMessages([...history, { role: "user", content: message }]);
    setDraft("");
    setError(null);
    setIsPending(true);

    try {
      const { reply, board } = await sendChat(boardId, message, history);
      setMessages((current) => [...current, { role: "assistant", content: reply }]);
      if (board) {
        // Already stored by the backend, so this only catches the UI up.
        onBoardChange(board);
      }
    } catch {
      setError("The assistant could not answer. Try again.");
    } finally {
      setIsPending(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        data-testid="chat-open"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 z-40 rounded-full bg-[var(--secondary-purple)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white shadow-[var(--shadow)] transition hover:opacity-90"
      >
        Ask AI
      </button>
    );
  }

  return (
    <>
      {/* Dims the board so it reads as unreachable while the panel is open, rather
          than leaving clipped controls (e.g. a column's Edit button) as the only cue. */}
      <div
        aria-hidden="true"
        onClick={() => setIsOpen(false)}
        className="fixed inset-0 z-30 bg-[var(--navy-dark)]/20"
      />
      <aside
        data-testid="chat-sidebar"
        aria-label="AI assistant"
        className="fixed inset-x-4 bottom-4 top-4 z-40 flex flex-col rounded-[32px] border border-[var(--stroke)] bg-[var(--surface-strong)]/95 shadow-[var(--shadow)] backdrop-blur sm:inset-x-auto sm:right-6 sm:w-[380px]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--stroke)] px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]">
              Assistant
            </p>
            <h2 className="mt-1 font-display text-lg font-semibold text-[var(--navy-dark)]">
              Ask about the board
            </h2>
          </div>
          <button
            type="button"
            data-testid="chat-close"
            onClick={() => setIsOpen(false)}
            className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
          >
            Hide
          </button>
        </div>

        <div
          ref={transcript}
          className="flex flex-1 flex-col gap-3 overflow-y-auto px-6 py-5"
        >
          {messages.length === 0 && !isPending && (
            <p className="text-sm leading-6 text-[var(--gray-text)]">
              Try &ldquo;add a card for the launch checklist to Backlog&rdquo; or ask what is
              in progress.
            </p>
          )}

          {messages.map((message, index) => (
            <div
              key={index}
              data-testid={`chat-${message.role}`}
              className={
                message.role === "user"
                  ? "self-end rounded-2xl rounded-br-sm bg-[var(--primary-blue)] px-4 py-3 text-sm leading-6 text-white"
                  : "self-start rounded-2xl rounded-bl-sm border border-[var(--stroke)] bg-[var(--surface)] px-4 py-3 text-sm leading-6 text-[var(--navy-dark)]"
              }
            >
              {message.content}
            </div>
          ))}

          {isPending && (
            <p
              role="status"
              data-testid="chat-pending"
              className="self-start text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]"
            >
              Thinking
            </p>
          )}
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-3 border-t border-[var(--stroke)] px-6 py-5"
        >
          {error && (
            <p
              role="alert"
              data-testid="chat-error"
              className="rounded-xl border border-[var(--accent-yellow)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--navy-dark)]"
            >
              {error}
            </p>
          )}
          <textarea
            aria-label="Message the assistant"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={3}
            placeholder="Ask a question or describe a change"
            className="resize-none rounded-2xl border border-[var(--stroke)] bg-white px-4 py-3 text-sm leading-6 text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
          />
          <button
            type="submit"
            disabled={isPending || !draft.trim()}
            className="rounded-full bg-[var(--secondary-purple)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.2em] text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? "Sending" : "Send"}
          </button>
        </form>
      </aside>
    </>
  );
};
