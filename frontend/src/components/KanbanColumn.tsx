import { useState } from "react";
import clsx from "clsx";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card, CardInput, Column } from "@/lib/kanban";
import { KanbanCard } from "@/components/KanbanCard";
import { NewCardForm } from "@/components/NewCardForm";

type KanbanColumnProps = {
  column: Column;
  cards: Card[];
  onRename: (columnId: string, title: string) => void;
  onAddCard: (columnId: string, input: CardInput) => void;
  onDeleteCard: (columnId: string, cardId: string) => void;
  onEditCard: (cardId: string, input: CardInput) => void;
  highlightedCardId?: string | null;
};

export const KanbanColumn = ({
  column,
  cards,
  onRename,
  onAddCard,
  onDeleteCard,
  onEditCard,
  highlightedCardId,
}: KanbanColumnProps) => {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const [draft, setDraft] = useState(column.title);
  const [titleInBoard, setTitleInBoard] = useState(column.title);

  // Adjusted during render rather than in an effect, which is what React recommends
  // for state derived from a prop. The board is the source of truth, so a title
  // changed elsewhere, such as by the AI, replaces what is in the field. A blank
  // draft never reaches the board, so nothing here overwrites it.
  if (column.title !== titleInBoard) {
    setTitleInBoard(column.title);
    setDraft(column.title);
  }

  const handleChange = (value: string) => {
    setDraft(value);
    // The API refuses a blank title, and once the board holds one every later save
    // fails too, with no way out but retyping. The board keeps the last usable title
    // while the field is empty.
    if (value.trim()) {
      onRename(column.id, value);
    }
  };

  return (
    <section
      ref={setNodeRef}
      className={clsx(
        "flex min-h-[520px] flex-col rounded-3xl border border-[var(--stroke)] bg-[var(--surface-strong)] p-4 shadow-[var(--shadow)] transition",
        isOver && "ring-2 ring-[var(--accent-yellow)]"
      )}
      data-testid={`column-${column.id}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="w-full">
          <div className="flex items-center gap-3">
            <div className="h-2 w-10 rounded-full bg-[var(--accent-yellow)]" />
            <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
              {cards.length} {cards.length === 1 ? "card" : "cards"}
            </span>
          </div>
          <input
            value={draft}
            onChange={(event) => handleChange(event.target.value)}
            onBlur={() => setDraft(column.title)}
            className="-mx-2 mt-3 w-full rounded-lg border border-transparent bg-transparent px-2 py-1 font-display text-lg font-semibold text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            aria-label={`Column title: ${column.title}`}
          />
        </div>
      </div>
      <div className="mt-4 flex flex-1 flex-col gap-3">
        <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onDelete={(cardId) => onDeleteCard(column.id, cardId)}
              onEdit={onEditCard}
              isHighlighted={card.id === highlightedCardId}
            />
          ))}
        </SortableContext>
        {cards.length === 0 && (
          <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[var(--stroke)] px-3 py-6 text-center text-xs font-semibold uppercase tracking-[0.2em] text-[var(--gray-text)]">
            Drop a card here
          </div>
        )}
      </div>
      <NewCardForm onAdd={(input) => onAddCard(column.id, input)} />
    </section>
  );
};
