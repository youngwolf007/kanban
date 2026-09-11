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
import { BoardSwitcher } from "@/components/BoardSwitcher";
import { ChatSidebar } from "@/components/ChatSidebar";
import { KanbanColumn } from "@/components/KanbanColumn";
import { KanbanCardPreview } from "@/components/KanbanCardPreview";
import { UndoToast } from "@/components/UndoToast";
import { getBoard, saveBoard, type BoardSummary } from "@/lib/api";
import {
  createId,
  moveCard,
  type BoardData,
  type Card,
  type CardInput,
} from "@/lib/kanban";

const RENAME_SAVE_DELAY = 500;
// Long enough to read the toast and react, short enough not to linger.
const UNDO_WINDOW = 6000;
// A newly added card stays highlighted this long, long enough to notice a card that
// landed below the fold, short enough to read as feedback rather than decoration.
const HIGHLIGHT_DURATION = 1600;

type DeletedCard = {
  card: Card;
  columnId: string;
  index: number;
};

type KanbanBoardProps = {
  boardId: number;
  boards: BoardSummary[];
  username?: string;
  onSignOut?: () => void;
  onSwitchBoard: (boardId: number) => void;
  onCreateBoard: () => void;
  onRenameBoard: (boardId: number, name: string) => void;
  onDeleteBoard: (boardId: number) => void;
};

export const KanbanBoard = ({
  boardId,
  boards,
  username,
  onSignOut,
  onSwitchBoard,
  onCreateBoard,
  onRenameBoard,
  onDeleteBoard,
}: KanbanBoardProps) => {
  const [board, setBoard] = useState<BoardData | null>(null);
  const [activeCardId, setActiveCardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletedCard, setDeletedCard] = useState<DeletedCard | null>(null);
  const [highlightedCardId, setHighlightedCardId] = useState<string | null>(null);
  const renameTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRename = useRef<BoardData | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  );

  useEffect(() => {
    getBoard(boardId)
      .then(setBoard)
      .catch(() => setError("Could not load your board."));
  }, [boardId]);

  useEffect(
    () => () => {
      if (renameTimer.current) {
        clearTimeout(renameTimer.current);
      }
      // Flush rather than drop: renaming a column and immediately signing out
      // would otherwise lose the rename.
      if (pendingRename.current) {
        saveBoard(boardId, pendingRename.current).catch(() => {});
      }
      if (undoTimer.current) {
        clearTimeout(undoTimer.current);
      }
      if (highlightTimer.current) {
        clearTimeout(highlightTimer.current);
      }
    },
    [boardId]
  );

  const persist = useCallback(
    async (next: BoardData) => {
      try {
        await saveBoard(boardId, next);
        setError(null);
      } catch {
        setError("Could not save your changes.");
      }
    },
    [boardId]
  );

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

  const handleAddCard = (columnId: string, input: CardInput) => {
    if (!board) {
      return;
    }
    const id = createId("card");
    applyChange({
      ...board,
      cards: {
        ...board.cards,
        [id]: { id, ...input },
      },
      columns: board.columns.map((column) =>
        column.id === columnId
          ? { ...column, cardIds: [...column.cardIds, id] }
          : column
      ),
    });

    if (highlightTimer.current) {
      clearTimeout(highlightTimer.current);
    }
    setHighlightedCardId(id);
    highlightTimer.current = setTimeout(
      () => setHighlightedCardId(null),
      HIGHLIGHT_DURATION
    );
  };

  const handleDeleteCard = (columnId: string, cardId: string) => {
    if (!board) {
      return;
    }
    const card = board.cards[cardId];
    const sourceColumn = board.columns.find((column) => column.id === columnId);
    const index = sourceColumn ? sourceColumn.cardIds.indexOf(cardId) : -1;

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

    if (card && index !== -1) {
      if (undoTimer.current) {
        clearTimeout(undoTimer.current);
      }
      setDeletedCard({ card, columnId, index });
      undoTimer.current = setTimeout(() => setDeletedCard(null), UNDO_WINDOW);
    }
  };

  const handleUndoDelete = () => {
    if (!board || !deletedCard) {
      return;
    }
    if (undoTimer.current) {
      clearTimeout(undoTimer.current);
      undoTimer.current = null;
    }
    const { card, columnId, index } = deletedCard;
    setDeletedCard(null);
    applyChange({
      ...board,
      cards: { ...board.cards, [card.id]: card },
      columns: board.columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              cardIds: [
                ...column.cardIds.slice(0, index),
                card.id,
                ...column.cardIds.slice(index),
              ],
            }
          : column
      ),
    });
  };

  const handleEditCard = (cardId: string, input: CardInput) => {
    if (!board) {
      return;
    }
    applyChange({
      ...board,
      cards: {
        ...board.cards,
        [cardId]: { id: cardId, ...input },
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
    <div className="relative">
      {/* overflow-hidden lives on this wrapper, not the outer div: an overflow-hidden
          ancestor is a scroll container, which breaks the header's position: sticky
          below by resolving it against the wrong scrollport. */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <BackgroundGlow />
      </div>

      <main className="relative mx-auto flex min-h-screen max-w-[1600px] flex-col gap-6 px-6 pb-16 pt-10">
        <header className="sticky top-4 z-20 flex flex-wrap items-start justify-between gap-6 rounded-[32px] border border-[var(--stroke)] bg-white/80 px-8 py-6 shadow-[var(--shadow)] backdrop-blur">
          <div>
            <BoardSwitcher
              boards={boards}
              currentBoardId={boardId}
              onSwitch={onSwitchBoard}
              onCreate={onCreateBoard}
              onRename={onRenameBoard}
              onDelete={onDeleteBoard}
            />
            <h1 className="mt-2 font-display text-3xl font-semibold text-[var(--navy-dark)]">
              Kanban Studio
            </h1>
          </div>
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
        </header>

        {error && (
          <p
            role="alert"
            data-testid="board-error"
            className="rounded-xl border border-[var(--accent-yellow)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--navy-dark)]"
          >
            {error}
          </p>
        )}

        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <section className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 min-[1152px]:grid-cols-4 xl:grid-cols-5">
            {board.columns.map((column) => (
              <KanbanColumn
                key={column.id}
                column={column}
                cards={column.cardIds.map((cardId) => board.cards[cardId])}
                onRename={handleRenameColumn}
                onAddCard={handleAddCard}
                onDeleteCard={handleDeleteCard}
                onEditCard={handleEditCard}
                highlightedCardId={highlightedCardId}
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

      {deletedCard && (
        <UndoToast
          message={`Deleted "${deletedCard.card.title}"`}
          onUndo={handleUndoDelete}
        />
      )}

      <ChatSidebar boardId={boardId} onBoardChange={adoptBoardFromAi} />
    </div>
  );
};
