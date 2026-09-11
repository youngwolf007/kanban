"use client";

import { useEffect, useState } from "react";
import {
  createBoard,
  deleteBoard,
  listBoards,
  removeMember,
  renameBoard,
  type BoardSummary,
} from "@/lib/api";
import { KanbanBoard } from "@/components/KanbanBoard";

type WorkspaceProps = {
  userId: number;
  username: string;
  onSignOut: () => void;
};

export const Workspace = ({ userId, username, onSignOut }: WorkspaceProps) => {
  const [boards, setBoards] = useState<BoardSummary[] | null>(null);
  const [currentBoardId, setCurrentBoardId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listBoards()
      .then(async (found) => {
        if (found.length === 0) {
          // A signed-in user always lands on a board; create the first one rather
          // than showing an empty workspace with nothing to click.
          found = [await createBoard()];
        }
        setBoards(found);
        setCurrentBoardId(found[0].id);
      })
      .catch(() => setError("Could not load your boards."));
  }, []);

  const handleCreate = async () => {
    setError(null);
    try {
      const board = await createBoard();
      setBoards((current) => [board, ...(current ?? [])]);
      setCurrentBoardId(board.id);
    } catch {
      setError("Could not create a board.");
    }
  };

  const handleRename = async (boardId: number, name: string) => {
    setError(null);
    try {
      const renamed = await renameBoard(boardId, name);
      setBoards((current) =>
        (current ?? []).map((board) => (board.id === boardId ? renamed : board))
      );
    } catch {
      setError("Could not rename the board.");
    }
  };

  /** Drops a board the user no longer has access to, keeping at least one board open. */
  const dropBoard = async (boardId: number) => {
    const remaining = (boards ?? []).filter((board) => board.id !== boardId);

    if (remaining.length === 0) {
      const fresh = await createBoard().catch(() => null);
      if (!fresh) {
        setError("Could not create a board.");
        setBoards([]);
        setCurrentBoardId(null);
        return;
      }
      setBoards([fresh]);
      setCurrentBoardId(fresh.id);
      return;
    }

    setBoards(remaining);
    if (boardId === currentBoardId) {
      setCurrentBoardId(remaining[0].id);
    }
  };

  const handleDelete = async (boardId: number) => {
    setError(null);
    try {
      await deleteBoard(boardId);
    } catch {
      setError("Could not delete the board.");
      return;
    }
    await dropBoard(boardId);
  };

  const handleLeave = async (boardId: number) => {
    setError(null);
    try {
      await removeMember(boardId, userId);
    } catch {
      setError("Could not leave the board.");
      return;
    }
    await dropBoard(boardId);
  };

  if (error && !boards) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-xs font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]">
        <span role="status">Boards unavailable</span>
        <p role="alert" data-testid="board-error" className="normal-case tracking-normal">
          {error}
        </p>
      </div>
    );
  }

  if (!boards || currentBoardId === null) {
    return (
      <div
        role="status"
        className="flex min-h-screen items-center justify-center text-xs font-semibold uppercase tracking-[0.3em] text-[var(--gray-text)]"
      >
        Loading
      </div>
    );
  }

  return (
    <>
      {error && (
        <p
          role="alert"
          data-testid="workspace-error"
          className="fixed left-1/2 top-4 z-50 -translate-x-1/2 rounded-xl border border-[var(--accent-yellow)] bg-white px-4 py-3 text-sm text-[var(--navy-dark)] shadow-[var(--shadow)]"
        >
          {error}
        </p>
      )}
      <KanbanBoard
        key={currentBoardId}
        boardId={currentBoardId}
        boards={boards}
        username={username}
        onSignOut={onSignOut}
        onSwitchBoard={setCurrentBoardId}
        onCreateBoard={handleCreate}
        onRenameBoard={handleRename}
        onDeleteBoard={handleDelete}
        onLeaveBoard={handleLeave}
      />
    </>
  );
};
