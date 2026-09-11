import { useRef, useState } from "react";
import { useOnClickOutside } from "@/lib/useOnClickOutside";
import {
  inviteMember,
  listMembers,
  removeMember,
  type BoardMember,
  type BoardSummary,
} from "@/lib/api";

type BoardSwitcherProps = {
  boards: BoardSummary[];
  currentBoardId: number;
  onSwitch: (boardId: number) => void;
  onCreate: () => void;
  onRename: (boardId: number, name: string) => void;
  onDelete: (boardId: number) => void;
  onLeave: (boardId: number) => void;
};

export const BoardSwitcher = ({
  boards,
  currentBoardId,
  onSwitch,
  onCreate,
  onRename,
  onDelete,
  onLeave,
}: BoardSwitcherProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [managingId, setManagingId] = useState<number | null>(null);
  const [members, setMembers] = useState<BoardMember[] | null>(null);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [inviteUsername, setInviteUsername] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useOnClickOutside(menuRef, () => {
    setIsOpen(false);
    setRenamingId(null);
    setManagingId(null);
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

  const toggleManaging = (board: BoardSummary) => {
    if (managingId === board.id) {
      setManagingId(null);
      return;
    }
    setManagingId(board.id);
    setMembers(null);
    setMemberError(null);
    setInviteUsername("");
    listMembers(board.id)
      .then(setMembers)
      .catch(() => setMemberError("Could not load members."));
  };

  const handleInvite = async (boardId: number) => {
    const username = inviteUsername.trim();
    if (!username) {
      return;
    }
    setMemberError(null);
    try {
      setMembers(await inviteMember(boardId, username));
      setInviteUsername("");
    } catch (error) {
      setMemberError(error instanceof Error ? error.message : "Could not invite.");
    }
  };

  const handleRemove = async (boardId: number, userId: number) => {
    setMemberError(null);
    try {
      await removeMember(boardId, userId);
      setMembers((current) => (current ?? []).filter((m) => m.userId !== userId));
    } catch {
      setMemberError("Could not remove that member.");
    }
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
          className="absolute left-0 top-full z-30 mt-2 w-80 rounded-2xl border border-[var(--stroke)] bg-white p-2 normal-case tracking-normal shadow-[var(--shadow)]"
        >
          <ul className="flex max-h-80 flex-col gap-1 overflow-y-auto">
            {boards.map((board) => (
              <li
                key={board.id}
                data-testid={`board-option-${board.id}`}
                className="rounded-xl px-2 py-1.5 hover:bg-[var(--surface)]"
              >
                <div className="flex items-center gap-2">
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
                  {board.isOwner ? (
                    <>
                      <button
                        type="button"
                        aria-label={`Share ${board.name}`}
                        onClick={() => toggleManaging(board)}
                        className="shrink-0 rounded-md px-1.5 py-1 text-xs text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
                      >
                        Share
                      </button>
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
                    </>
                  ) : (
                    <>
                      <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-[var(--gray-text)]">
                        Shared by {board.ownerUsername}
                      </span>
                      <button
                        type="button"
                        aria-label={`Leave ${board.name}`}
                        onClick={() => onLeave(board.id)}
                        className="shrink-0 rounded-md px-1.5 py-1 text-xs text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
                      >
                        Leave
                      </button>
                    </>
                  )}
                </div>

                {managingId === board.id && (
                  <div
                    data-testid={`board-members-${board.id}`}
                    className="mt-2 rounded-xl border border-[var(--stroke)] bg-[var(--surface)] p-2"
                  >
                    {members === null && !memberError && (
                      <p className="px-1 py-1 text-xs text-[var(--gray-text)]">Loading…</p>
                    )}
                    {members !== null && members.length === 0 && (
                      <p className="px-1 py-1 text-xs text-[var(--gray-text)]">
                        Only you have access.
                      </p>
                    )}
                    {members?.map((member) => (
                      <div
                        key={member.userId}
                        className="flex items-center justify-between gap-2 px-1 py-1"
                      >
                        <span className="truncate text-xs text-[var(--navy-dark)]">
                          {member.username}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove ${member.username} from ${board.name}`}
                          onClick={() => handleRemove(board.id, member.userId)}
                          className="shrink-0 text-xs text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                    {memberError && (
                      <p role="alert" className="px-1 py-1 text-xs text-[var(--secondary-purple)]">
                        {memberError}
                      </p>
                    )}
                    <form
                      onSubmit={(event) => {
                        event.preventDefault();
                        handleInvite(board.id);
                      }}
                      className="mt-1 flex items-center gap-1"
                    >
                      <input
                        value={inviteUsername}
                        onChange={(event) => setInviteUsername(event.target.value)}
                        placeholder="Invite by username"
                        aria-label={`Invite a member to ${board.name}`}
                        className="min-w-0 flex-1 rounded-lg border border-[var(--stroke)] bg-white px-2 py-1 text-xs outline-none focus:border-[var(--primary-blue)]"
                      />
                      <button
                        type="submit"
                        className="shrink-0 rounded-md bg-[var(--secondary-purple)] px-2 py-1 text-xs font-semibold text-white transition hover:brightness-110"
                      >
                        Invite
                      </button>
                    </form>
                  </div>
                )}
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
