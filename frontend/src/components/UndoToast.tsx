type UndoToastProps = {
  message: string;
  onUndo: () => void;
};

export const UndoToast = ({ message, onUndo }: UndoToastProps) => (
  <div
    role="status"
    data-testid="undo-toast"
    className="fixed bottom-6 left-6 z-40 flex items-center gap-4 rounded-full border border-[var(--stroke)] bg-[var(--toast-bg)] px-5 py-3 text-sm text-white shadow-[var(--shadow)]"
  >
    <span>{message}</span>
    <button
      type="button"
      onClick={onUndo}
      className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-yellow)] transition hover:opacity-80"
    >
      Undo
    </button>
  </div>
);
