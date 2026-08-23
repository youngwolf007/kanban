"use client";

import { useId, useReducer, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { boardReducer } from "@/lib/boardReducer";
import { seedBoard } from "@/lib/seedData";
import type { Card as CardType } from "@/lib/types";
import Column from "./Column";
import Card from "./Card";
import CardModal from "./CardModal";

export default function Board() {
  const dndId = useId();
  const [board, dispatch] = useReducer(boardReducer, seedBoard);
  const [activeCard, setActiveCard] = useState<CardType | null>(null);
  const [editingCard, setEditingCard] = useState<CardType | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  function findColumnId(cardId: string) {
    return board.columns.find((c) => c.cardIds.includes(cardId))?.id;
  }

  function handleDragStart(event: DragStartEvent) {
    const card = board.cards[event.active.id as string];
    setActiveCard(card ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveCard(null);
    const { active, over } = event;
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;
    if (activeId === overId) return;

    const overColumn = board.columns.find((c) => c.id === overId);
    if (overColumn) {
      dispatch({
        type: "MOVE_CARD",
        cardId: activeId,
        toColumnId: overColumn.id,
        toIndex: overColumn.cardIds.length,
      });
      return;
    }

    const toColumnId = findColumnId(overId);
    if (!toColumnId) return;
    const toColumn = board.columns.find((c) => c.id === toColumnId)!;
    const overIndex = toColumn.cardIds.indexOf(overId);

    dispatch({
      type: "MOVE_CARD",
      cardId: activeId,
      toColumnId,
      toIndex: overIndex === -1 ? toColumn.cardIds.length : overIndex,
    });
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b-4 border-accent-yellow bg-navy-dark px-6 py-5 shadow-md">
        <h1 className="text-xl font-bold text-white">Project Board</h1>
        <p className="text-sm text-white/60">Drag cards between columns to update their status.</p>
      </header>

      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto px-6 py-6">
          {board.columns.map((column) => (
            <Column
              key={column.id}
              column={column}
              cards={column.cardIds.map((id) => board.cards[id]).filter(Boolean)}
              onRename={(columnId, title) => dispatch({ type: "RENAME_COLUMN", columnId, title })}
              onOpenCard={setEditingCard}
              onDeleteCard={(cardId) => dispatch({ type: "DELETE_CARD", cardId })}
              onAddCard={(columnId, title) =>
                dispatch({ type: "ADD_CARD", columnId, title, details: "" })
              }
            />
          ))}
        </div>

        <DragOverlay>
          {activeCard ? (
            <Card card={activeCard} onOpen={() => {}} onDelete={() => {}} />
          ) : null}
        </DragOverlay>
      </DndContext>

      {editingCard && (
        <CardModal
          card={editingCard}
          onClose={() => setEditingCard(null)}
          onSave={(cardId, title, details) => dispatch({ type: "EDIT_CARD", cardId, title, details })}
        />
      )}
    </div>
  );
}
