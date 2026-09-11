import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import clsx from "clsx";
import { isOverdue, NO_DETAILS, parseLabels, type Card, type CardInput } from "@/lib/kanban";
import { CardMetaFields } from "@/components/CardMetaFields";

type KanbanCardProps = {
  card: Card;
  onDelete: (cardId: string) => void;
  onEdit: (cardId: string, input: CardInput) => void;
  isHighlighted?: boolean;
  isDimmed?: boolean;
};

const PRIORITY_STYLES: Record<string, string> = {
  low: "border-[var(--primary-blue)]/30 bg-[var(--primary-blue)]/10 text-[var(--primary-blue-text)]",
  medium: "border-[var(--accent-yellow)]/50 bg-[var(--accent-yellow)]/15 text-[var(--navy-dark)]",
  high: "border-[var(--secondary-purple)]/30 bg-[var(--secondary-purple)]/10 text-[var(--secondary-purple)]",
};

const draftFromCard = (card: Card): CardInput => ({
  title: card.title,
  details: card.details,
  priority: card.priority,
  dueDate: card.dueDate,
  labels: card.labels,
});

export const KanbanCard = ({
  card,
  onDelete,
  onEdit,
  isHighlighted,
  isDimmed,
}: KanbanCardProps) => {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState<CardInput>(draftFromCard(card));
  const [labelsText, setLabelsText] = useState(card.labels.join(", "));
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id, disabled: isEditing });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const cardRef = useRef<HTMLElement | null>(null);
  const setCardRef = (node: HTMLElement | null) => {
    setNodeRef(node);
    cardRef.current = node;
  };

  // A newly added card can land below the fold. scrollIntoView is missing in jsdom,
  // hence the optional call rather than a jsdom-side workaround.
  useEffect(() => {
    if (isHighlighted) {
      cardRef.current?.scrollIntoView?.({ behavior: "smooth", block: "nearest" });
    }
  }, [isHighlighted]);

  const startEditing = () => {
    setDraft(draftFromCard(card));
    setLabelsText(card.labels.join(", "));
    setIsEditing(true);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft.title.trim()) {
      return;
    }
    onEdit(card.id, {
      title: draft.title.trim(),
      details: draft.details.trim(),
      priority: draft.priority,
      dueDate: draft.dueDate,
      labels: parseLabels(labelsText),
    });
    setIsEditing(false);
  };

  if (isEditing) {
    // Drag listeners are left off while editing so typing cannot start a drag.
    return (
      <article
        ref={setNodeRef}
        style={style}
        className="rounded-2xl border border-[var(--primary-blue)] bg-white px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]"
        data-testid={`card-${card.id}`}
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            value={draft.title}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, title: event.target.value }))
            }
            aria-label="Card title"
            className="w-full rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm font-semibold text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            required
          />
          <textarea
            value={draft.details}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, details: event.target.value }))
            }
            aria-label="Card details"
            rows={3}
            className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--gray-text)] outline-none transition focus:border-[var(--primary-blue)]"
          />
          <CardMetaFields
            priority={draft.priority}
            dueDate={draft.dueDate}
            labelsText={labelsText}
            onPriorityChange={(priority) => setDraft((prev) => ({ ...prev, priority }))}
            onDueDateChange={(dueDate) => setDraft((prev) => ({ ...prev, dueDate }))}
            onLabelsTextChange={setLabelsText}
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
            >
              Save card
            </button>
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
            >
              Cancel
            </button>
          </div>
        </form>
      </article>
    );
  }

  return (
    <article
      ref={setCardRef}
      style={style}
      className={clsx(
        "rounded-2xl border border-transparent bg-white px-4 py-4 shadow-[0_12px_24px_rgba(3,33,71,0.08)]",
        "transition-all duration-150",
        isDragging && "opacity-60 shadow-[0_18px_32px_rgba(3,33,71,0.16)]",
        isHighlighted && "ring-2 ring-[var(--accent-yellow)]",
        isDimmed && "opacity-35"
      )}
      data-testid={`card-${card.id}`}
      data-card-match={isDimmed ? "false" : "true"}
    >
      <div className="flex items-start gap-2">
        {/* The drag listeners live on their own control. Carrying them on the article
            gave it role="button" from dnd-kit while the action buttons sat inside it,
            which is ambiguous to a screen reader and to any role query. */}
        <button
          type="button"
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Drag ${card.title}`}
          className="mt-1 shrink-0 cursor-grab touch-none rounded-md p-1.5 text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
        >
          <svg aria-hidden="true" viewBox="0 0 10 16" className="h-4 w-3 fill-current">
            <circle cx="3" cy="3" r="1.3" />
            <circle cx="7" cy="3" r="1.3" />
            <circle cx="3" cy="8" r="1.3" />
            <circle cx="7" cy="8" r="1.3" />
            <circle cx="3" cy="13" r="1.3" />
            <circle cx="7" cy="13" r="1.3" />
          </svg>
        </button>
        {/* min-w-0 or this refuses to shrink past its longest word, pushing the
            shrink-0 buttons outside the card once the column gets narrow. Icon
            buttons rather than text ones so this column stays as wide as possible. */}
        <div className="min-w-0 flex-1 break-words">
          <h4 className="font-display text-base font-semibold text-[var(--navy-dark)]">
            {card.title}
          </h4>
          <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">
            {card.details || NO_DETAILS}
          </p>
          {(card.priority || card.dueDate || card.labels.length > 0) && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {card.priority && (
                <span
                  className={clsx(
                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                    PRIORITY_STYLES[card.priority]
                  )}
                >
                  {card.priority}
                </span>
              )}
              {card.dueDate && (
                <span
                  className={clsx(
                    "rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                    isOverdue(card.dueDate)
                      ? "border-[var(--secondary-purple)]/30 bg-[var(--secondary-purple)]/10 text-[var(--secondary-purple)]"
                      : "border-[var(--stroke)] bg-[var(--surface)] text-[var(--gray-text)]"
                  )}
                >
                  {isOverdue(card.dueDate) ? `Overdue ${card.dueDate}` : card.dueDate}
                </span>
              )}
              {card.labels.map((label) => (
                <span
                  key={label}
                  className="rounded-full border border-[var(--stroke)] bg-[var(--surface)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--gray-text)]"
                >
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={startEditing}
            className="rounded-full border border-transparent p-1.5 text-[var(--primary-blue)] transition hover:border-[var(--stroke)] hover:bg-[var(--surface)]"
            aria-label={`Edit ${card.title}`}
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4">
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.5 2.5a1.5 1.5 0 0 1 2 2L5 13l-3 1 1-3 8.5-8.5Z"
              />
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                d="M9.5 4.5l2 2"
              />
            </svg>
          </button>
          <button
            type="button"
            onClick={() => onDelete(card.id)}
            className="rounded-full border border-transparent p-1.5 text-[var(--gray-text)] transition hover:border-[var(--stroke)] hover:bg-[var(--surface)] hover:text-[var(--navy-dark)]"
            aria-label={`Delete ${card.title}`}
          >
            <svg aria-hidden="true" viewBox="0 0 16 16" className="h-4 w-4">
              <path
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3 4.5h10M6.5 4.5V3a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1.5M4.5 4.5 5 13a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1l.5-8.5M6.7 7v4.2M9.3 7v4.2"
              />
            </svg>
          </button>
        </div>
      </div>
    </article>
  );
};
