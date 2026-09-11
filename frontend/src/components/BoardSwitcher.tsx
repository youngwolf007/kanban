import { useRef, useState } from "react";
import { useOnClickOutside } from "@/lib/useOnClickOutside";
import type { BoardSummary } from "@/lib/api";

type BoardSwitcherProps = {
  boards: BoardSummary[];
  currentBoardId: number;
  onSwitch: (boardId: number) => void;
  onCreate: () => void;
  onRename: (boardId: number, name: string) => void;
  onDelete: (boardId: number) => void;
};

export const BoardSwitcher = ({
  boards,
  currentBoardId,
  onSwitch,
  onCreate,
  onRename,
  onDelete,
}: BoardSwitcherProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(menuRef, () => {
    setIsOpen(false);
    setRenamingId(null);
  });

  const current = boards.find((board) => board.id === currentBoardId);

  const startRenaming = (board: BoardSummary) => {
    setRenamingId(board.id);
    setDraft(board.name);
  };

  const commitRename = (boardId: number) => {
    const name = draft.trim();
    if (name) {
      onRename(boardId, name);
    }
    setRenamingId(null);
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        type="button"
        data-testid="board-switcher"
        onClick={() => setIsOpen((open) => !open)}
        className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.35em] text-[var(--gray-text)] transition hover:text-[var(--primary-blue-text)]"
      >
        Board: {current?.name ?? "…"}
        <span aria-hidden="true">{isOpen ? "▲" : "▼"}</span>
      </button>

      {isOpen && (
        <div
          data-testid="board-menu"
          className="absolute left-0 top-full z-30 mt-2 w-72 rounded-2xl border border-[var(--stroke)] bg-white p-2 normal-case tracking-normal shadow-[var(--shadow)]"
        >
          <ul className="flex max-h-64 flex-col gap-1 overflow-y-auto">
            {boards.map((board) => (
              <li
                key={board.id}
                data-testid={`board-option-${board.id}`}
                className="flex items-center gap-2 rounded-xl px-2 py-1.5 hover:bg-[var(--surface)]"
              >
                {renamingId === board.id ? (
                  <input
                    autoFocus
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    onBlur={() => commitRename(board.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        commitRename(board.id);
                      }
                      if (event.key === "Escape") {
                        setRenamingId(null);
                      }
                    }}
                    aria-label={`New name for ${board.name}`}
                    className="min-w-0 flex-1 rounded-lg border border-[var(--primary-blue)] bg-white px-2 py-1 text-sm outline-none"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      onSwitch(board.id);
                      setIsOpen(false);
                    }}
                    className={`min-w-0 flex-1 truncate text-left text-sm font-medium ${
                      board.id === currentBoardId
                        ? "text-[var(--primary-blue-text)]"
                        : "text-[var(--navy-dark)]"
                    }`}
                  >
                    {board.name}
                  </button>
                )}
                <button
                  type="button"
                  aria-label={`Rename ${board.name}`}
                  onClick={() => startRenaming(board)}
                  className="shrink-0 rounded-md px-1.5 py-1 text-xs text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
                >
                  Rename
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${board.name}`}
                  onClick={() => onDelete(board.id)}
                  className="shrink-0 rounded-md px-1.5 py-1 text-xs text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            data-testid="board-create"
            onClick={() => {
              onCreate();
              setIsOpen(false);
            }}
            className="mt-2 w-full rounded-xl border border-dashed border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue-text)] transition hover:border-[var(--primary-blue)]"
          >
            New board
          </button>
        </div>
      )}
    </div>
  );
};
