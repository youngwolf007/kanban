"use client";

import { useState } from "react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { Card as CardType, Column as ColumnType } from "@/lib/types";
import Card from "./Card";

interface ColumnProps {
  column: ColumnType;
  cards: CardType[];
  onRename: (columnId: string, title: string) => void;
  onOpenCard: (card: CardType) => void;
  onDeleteCard: (cardId: string) => void;
  onAddCard: (columnId: string, title: string) => void;
}

export default function Column({
  column,
  cards,
  onRename,
  onOpenCard,
  onDeleteCard,
  onAddCard,
}: ColumnProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(column.title);
  const [isAdding, setIsAdding] = useState(false);
  const [newCardTitle, setNewCardTitle] = useState("");

  const { setNodeRef } = useDroppable({ id: column.id });

  function commitTitle() {
    const trimmed = titleDraft.trim();
    setIsEditingTitle(false);
    if (trimmed && trimmed !== column.title) {
      onRename(column.id, trimmed);
    } else {
      setTitleDraft(column.title);
    }
  }

  function commitNewCard() {
    const trimmed = newCardTitle.trim();
    if (trimmed) {
      onAddCard(column.id, trimmed);
    }
    setNewCardTitle("");
    setIsAdding(false);
  }

  return (
    <div
      data-testid={`column-${column.id}`}
      className="flex w-72 shrink-0 flex-col rounded-xl border border-black/5 bg-white/60 p-3 shadow-sm"
    >
      <div className="mb-3 flex items-center justify-between border-b-2 border-accent-yellow pb-2">
        {isEditingTitle ? (
          <input
            value={titleDraft}
            autoFocus
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitTitle();
              if (e.key === "Escape") {
                setTitleDraft(column.title);
                setIsEditingTitle(false);
              }
            }}
            className="w-full rounded-sm bg-white px-1 py-0.5 text-sm font-semibold text-navy-dark focus:outline-none"
          />
        ) : (
          <h2
            onClick={() => setIsEditingTitle(true)}
            className="cursor-text truncate text-sm font-semibold text-navy-dark"
            title="Click to rename"
          >
            {column.title}
          </h2>
        )}
        <span className="ml-2 shrink-0 rounded-full bg-black/5 px-2 py-0.5 text-xs font-medium text-gray-text">
          {cards.length}
        </span>
      </div>

      <div ref={setNodeRef} className="flex min-h-[40px] flex-1 flex-col gap-2">
        <SortableContext items={column.cardIds} strategy={verticalListSortingStrategy}>
          {cards.map((card) => (
            <Card key={card.id} card={card} onOpen={onOpenCard} onDelete={onDeleteCard} />
          ))}
        </SortableContext>
      </div>

      {isAdding ? (
        <div className="mt-2">
          <input
            value={newCardTitle}
            autoFocus
            placeholder="Card title"
            onChange={(e) => setNewCardTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitNewCard();
              if (e.key === "Escape") {
                setNewCardTitle("");
                setIsAdding(false);
              }
            }}
            className="mb-2 w-full rounded-md border border-black/10 bg-white px-2 py-1.5 text-sm text-navy-dark focus:border-blue-primary focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={commitNewCard}
              className="rounded-md bg-purple-secondary px-3 py-1 text-xs font-medium text-white hover:opacity-90"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setNewCardTitle("");
                setIsAdding(false);
              }}
              className="rounded-md px-3 py-1 text-xs font-medium text-gray-text hover:bg-black/5"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="mt-2 rounded-md py-1.5 text-left text-sm text-blue-primary hover:bg-white/60"
        >
          + Add a card
        </button>
      )}
    </div>
  );
}
