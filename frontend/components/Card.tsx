"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Card as CardType } from "@/lib/types";

interface CardProps {
  card: CardType;
  onOpen: (card: CardType) => void;
  onDelete: (cardId: string) => void;
}

export default function Card({ card, onOpen, onDelete }: CardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(card)}
      className="group relative cursor-grab rounded-lg border border-black/5 bg-white p-3 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md active:cursor-grabbing"
    >
      <button
        type="button"
        aria-label="Delete card"
        onClick={(e) => {
          e.stopPropagation();
          onDelete(card.id);
        }}
        className="absolute top-2 right-2 rounded-md p-1 text-gray-text opacity-0 transition group-hover:opacity-100 hover:bg-red-50 hover:text-red-500"
      >
        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 6h12M8 6V4h4v2M6 6l1 10h6l1-10" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <p className="pr-5 text-sm font-medium text-navy-dark">{card.title}</p>
      {card.details && (
        <p className="mt-1 line-clamp-2 text-xs text-gray-text">{card.details}</p>
      )}
    </div>
  );
}
