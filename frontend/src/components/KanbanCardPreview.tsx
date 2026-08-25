import { NO_DETAILS, type Card } from "@/lib/kanban";

type KanbanCardPreviewProps = {
  card: Card;
};

export const KanbanCardPreview = ({ card }: KanbanCardPreviewProps) => (
  <article className="rounded-2xl border border-transparent bg-white px-4 py-4 shadow-[0_18px_32px_rgba(3,33,71,0.16)]">
    <div className="flex items-start justify-between gap-3">
      {/* min-w-0 break-words for the same reason as KanbanCard: without it a long
          word refuses to shrink and spills out of the preview. */}
      <div className="min-w-0 break-words">
        <h4 className="font-display text-base font-semibold text-[var(--navy-dark)]">
          {card.title}
        </h4>
        <p className="mt-2 text-sm leading-6 text-[var(--gray-text)]">
          {card.details || NO_DETAILS}
        </p>
      </div>
    </div>
  </article>
);
