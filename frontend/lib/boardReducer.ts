import type { Board, Card } from "./types";

export type BoardAction =
  | { type: "RENAME_COLUMN"; columnId: string; title: string }
  | { type: "ADD_CARD"; columnId: string; title: string; details: string }
  | { type: "DELETE_CARD"; cardId: string }
  | { type: "EDIT_CARD"; cardId: string; title: string; details: string }
  | { type: "MOVE_CARD"; cardId: string; toColumnId: string; toIndex: number };

function findColumnOfCard(board: Board, cardId: string): string | undefined {
  return board.columns.find((c) => c.cardIds.includes(cardId))?.id;
}

export function boardReducer(board: Board, action: BoardAction): Board {
  switch (action.type) {
    case "RENAME_COLUMN": {
      return {
        ...board,
        columns: board.columns.map((c) =>
          c.id === action.columnId ? { ...c, title: action.title } : c
        ),
      };
    }
    case "ADD_CARD": {
      const id = `card-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const newCard: Card = { id, title: action.title, details: action.details };
      return {
        ...board,
        cards: { ...board.cards, [id]: newCard },
        columns: board.columns.map((c) =>
          c.id === action.columnId ? { ...c, cardIds: [...c.cardIds, id] } : c
        ),
      };
    }
    case "DELETE_CARD": {
      const remainingCards = { ...board.cards };
      delete remainingCards[action.cardId];
      return {
        ...board,
        cards: remainingCards,
        columns: board.columns.map((c) => ({
          ...c,
          cardIds: c.cardIds.filter((id) => id !== action.cardId),
        })),
      };
    }
    case "EDIT_CARD": {
      const existing = board.cards[action.cardId];
      if (!existing) return board;
      return {
        ...board,
        cards: {
          ...board.cards,
          [action.cardId]: { ...existing, title: action.title, details: action.details },
        },
      };
    }
    case "MOVE_CARD": {
      const fromColumnId = findColumnOfCard(board, action.cardId);
      if (!fromColumnId) return board;

      const columns = board.columns.map((c) => ({ ...c, cardIds: [...c.cardIds] }));
      const fromColumn = columns.find((c) => c.id === fromColumnId)!;
      const toColumn = columns.find((c) => c.id === action.toColumnId);
      if (!toColumn) return board;

      const fromIndex = fromColumn.cardIds.indexOf(action.cardId);
      fromColumn.cardIds.splice(fromIndex, 1);

      let toIndex = action.toIndex;
      if (fromColumnId === action.toColumnId && fromIndex < toIndex) {
        toIndex -= 1;
      }
      const clampedIndex = Math.max(0, Math.min(toIndex, toColumn.cardIds.length));
      toColumn.cardIds.splice(clampedIndex, 0, action.cardId);

      return { ...board, columns };
    }
    default:
      return board;
  }
}
