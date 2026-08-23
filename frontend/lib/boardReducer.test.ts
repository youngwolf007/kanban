import { describe, expect, it } from "vitest";
import { boardReducer } from "./boardReducer";
import type { Board } from "./types";

function makeBoard(): Board {
  return {
    columns: [
      { id: "col-1", title: "Backlog", cardIds: ["card-1", "card-2"] },
      { id: "col-2", title: "To Do", cardIds: ["card-3"] },
    ],
    cards: {
      "card-1": { id: "card-1", title: "First", details: "" },
      "card-2": { id: "card-2", title: "Second", details: "" },
      "card-3": { id: "card-3", title: "Third", details: "" },
    },
  };
}

describe("boardReducer", () => {
  it("renames a column", () => {
    const board = makeBoard();
    const result = boardReducer(board, { type: "RENAME_COLUMN", columnId: "col-1", title: "Ideas" });
    expect(result.columns[0].title).toBe("Ideas");
    expect(result.columns[1].title).toBe("To Do");
  });

  it("adds a card to a column", () => {
    const board = makeBoard();
    const result = boardReducer(board, {
      type: "ADD_CARD",
      columnId: "col-2",
      title: "New card",
      details: "Some details",
    });
    const col2 = result.columns.find((c) => c.id === "col-2")!;
    expect(col2.cardIds).toHaveLength(2);
    const newCardId = col2.cardIds[1];
    expect(result.cards[newCardId]).toMatchObject({ title: "New card", details: "Some details" });
  });

  it("deletes a card and removes it from its column", () => {
    const board = makeBoard();
    const result = boardReducer(board, { type: "DELETE_CARD", cardId: "card-1" });
    expect(result.cards["card-1"]).toBeUndefined();
    expect(result.columns[0].cardIds).toEqual(["card-2"]);
  });

  it("edits a card's title and details", () => {
    const board = makeBoard();
    const result = boardReducer(board, {
      type: "EDIT_CARD",
      cardId: "card-1",
      title: "Updated",
      details: "Updated details",
    });
    expect(result.cards["card-1"]).toMatchObject({ title: "Updated", details: "Updated details" });
  });

  it("editing a non-existent card is a no-op", () => {
    const board = makeBoard();
    const result = boardReducer(board, {
      type: "EDIT_CARD",
      cardId: "missing",
      title: "x",
      details: "y",
    });
    expect(result).toEqual(board);
  });

  it("moves a card to a different column", () => {
    const board = makeBoard();
    const result = boardReducer(board, {
      type: "MOVE_CARD",
      cardId: "card-1",
      toColumnId: "col-2",
      toIndex: 0,
    });
    expect(result.columns[0].cardIds).toEqual(["card-2"]);
    expect(result.columns[1].cardIds).toEqual(["card-1", "card-3"]);
  });

  it("reorders a card within the same column", () => {
    const board = makeBoard();
    const result = boardReducer(board, {
      type: "MOVE_CARD",
      cardId: "card-1",
      toColumnId: "col-1",
      toIndex: 2,
    });
    expect(result.columns[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moving an unknown card is a no-op", () => {
    const board = makeBoard();
    const result = boardReducer(board, {
      type: "MOVE_CARD",
      cardId: "missing",
      toColumnId: "col-2",
      toIndex: 0,
    });
    expect(result).toEqual(board);
  });
});
