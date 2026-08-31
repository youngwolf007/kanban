"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { BackgroundGlow } from "@/components/BackgroundGlow";
import { ChatSidebar } from "@/components/ChatSidebar";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { getBoard, saveBoard } from "@/lib/api";
import { createId, moveCard, type BoardData } from "@/lib/kanban";

const RENAME_SAVE_DELAY = 500;

type KanbanBoardProps = {
  username?: string;
  onSignOut?: () => void;
};

export const KanbanBoard = ({ username, onSignOut }: KanbanBoardProps = {}) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const renameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRename = useRef<BoardData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  useEffect(() => {
    getBoard()
      .then(setBoard)
      .catch(() => setError("Could not load your board."));
  }, []);

  useEffect(
    () => () => {
      if (renameTimer.current) {
        clearTimeout(renameTimer.current);
      }
      // Flush rather than drop: renaming a column and immediately signing out
      // would otherwise lose the rename.
      if (pendingRename.current) {
        saveBoard(pendingRename.current).catch(() => {});
      }
    },
    []
  );

  const persist = useCallback(async (next: BoardData) => {
    try {
      await saveBoard(next);
      setError(null);
    } catch {
      setError("Could not save your changes.");
    }
  }, []);

  const cancelPendingRename = useCallback(() => {
    if (renameTimer.current) {
      clearTimeout(renameTimer.current);
      renameTimer.current = null;
    }
    pendingRename.current = null;
  }, []);

  // Renaming fires on every keystroke, so its save waits for typing to stop.
  const persistAfterTyping = useCallback(
    (next: BoardData) => {
      cancelPendingRename();
      pendingRename.current = next;
      renameTimer.current = setTimeout(() => {
        pendingRename.current = null;
        persist(next);
      }, RENAME_SAVE_DELAY);
    },
    [cancelPendingRename, persist]
  );

  const applyChange = useCallback(
    (next: BoardData, debounced = false) => {
      setBoard(next);
      if (debounced) {
        persistAfterTyping(next);
        return;
      }
      // `next` derives from current state, so it already carries any rename still
      // waiting. Letting that older snapshot save would put this change back.
      cancelPendingRename();
      persist(next);
    },
    [cancelPendingRename, persist, persistAfterTyping]
  );

  const adoptBoardFromAi = useCallback(
    (next: BoardData) => {
      // The AI wrote through the backend, so its board is already stored. A rename
      // still waiting is dropped, not flushed: saving that older board would undo
      // the change the AI just made.
      cancelPendingRename();
      setBoard(next);
    },
    [cancelPendingRename]
  );

  const handleDragStart = (event: DragStartEvent) => {
    setActiveCardId(event.active.id as string);
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCardId(null);

    if (!board || !over || active.id === over.id) {
      return;
    }

    const columns = moveCard(board.columns, active.id as string, over.id as string);
    if (columns === board.columns) {
      return;
    }
    applyChange({ ...board, columns });
  };

  const handleRenameColumn = (columnId: string, title: string) => {
    if (!board) {
      return;
    }
    applyChange(
      {
        ...board,
        columns: board.columns.map((column) =>
          column.id === columnId ? { ...column, title } : column
        ),
      },
      true
    );
  };

  const handleAddCard = (columnId: string, title: string, details: string) => {
    if (!board) {
      return;
    }
    const id = createId("card");
    applyChange({
      ...board,
      cards: {
        ...board.cards,
        [id]: { id, title, details },
      },
      columns: board.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column
      ),
    });
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    if (!board) {
      return;
    }
    applyChange({
      ...board,
      cards: Object.fromEntries(
        Object.entries(board.cards).filter(([id]) => id !== cardId)
      ),
      columns: board.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: column.cardIds.filter((id) => id !== cardId) }
          : column
      ),
    });
  };

  const handleEditCard = (cardId: string, title: string, details: string) => {
    if (!board) {
      return;
    }
    applyChange({
      ...board,
      cards: {
        ...board.cards,
        [cardId]: { id: cardId, title, details },
      },
    });
  };

  if (!board) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]">
        <span role="status">{error ? "Board unavailable" : "Loading board"}</span>
        {error && (
          <p role="alert" data-testid="board-error" className="normal-case tracking-normal">
            {error}
          </p>
        )}
      </div>
    );
  }

  const activeCard = activeCardId ? board.cards[activeCardId] : null;

  return (
    <div className="relative overflow-hidden">
      <BackgroundGlow />

      <main className="relative mx-auto flex min-h-screen max-w-[1500px] flex-col gap-10 px-6 pb-16 pt-12">
        <header className="flex flex-col gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 p-8 shadow-[var(--shadow)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)]">
                Single Board Kanban
              </p>
              <h1 className="mt-3 font-display text-4xl font-semibold text-[var(--navy-dark)]">
                Kanban Studio
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-[var(--gray-text)]">
                Keep momentum visible. Rename columns, drag cards between stages,
                and capture quick notes without getting buried in settings.
              </p>
            </div>
            <div className="flex flex-col items-end gap-3">
              {onSignOut && (
                <div className="flex items-center gap-3">
                  {username && (
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
                      {username}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={onSignOut}
                    className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--navy-dark)] transition hover:border-[var(--primary-blue)] hover:text-[var(--primary-blue)]"
                  >
                    Sign out
                  </button>
                </div>
              )}
              <div className="rounded-2xl border border-[var(--stroke)] bg-[var(--surface)] px-5 py-4">
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-[var(--gray-text)]">
                  Focus
                </p>
                <p className="mt-2 text-lg font-semibold text-[var(--primary-blue)]">
                  One board. Five columns. Zero clutter.
                </p>
              </div>
            </div>
          </div>

          {error && (
            <p
              role="alert"
              data-testid="board-error"
              className="rounded-xl border border-[var(--accent-yellow)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--navy-dark)]"
            >
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-4">
            {board.columns.map((column) => (
              <div
                key={column.id}
                className="flex items-center gap-2 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--navy-dark)]"
              >
                <span className="h-2 w-2 rounded-full bg-[var(--accent-yellow)]" />
                {column.title}
              </div>
            ))}
          </div>
        </header>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section className="grid gap-6 lg:grid-cols-5">
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={column.cardIds.map((cardId) => board.cards[cardId])}
                onRename={handleRenameColumn}
                onAddCard={handleAddCard}
                onDeleteCard={handleDeleteCard}
                onEditCard={handleEditCard}
              />
            ))}
          </section>
          <DragOverlay>
            {activeCard ? (
              <div className="w-[260px]">
                <KanbanCardPreview card={activeCard} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </main>

      <ChatSidebar onBoardChange={adoptBoardFromAi} />
    </div>
  );
};
