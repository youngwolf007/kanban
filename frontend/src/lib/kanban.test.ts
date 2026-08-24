import { createId, moveCard, type Column } from "@/lib/kanban";

describe("moveCard", () => {
  const baseColumns: Column[] = [
    { id: "col-a", title: "A", cardIds: ["card-1", "card-2"] },
    { id: "col-b", title: "B", cardIds: ["card-3"] },
  ];

  it("reorders cards in the same column", () => {
    const result = moveCard(baseColumns, "card-2", "card-1");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("moves cards to another column", () => {
    const result = moveCard(baseColumns, "card-2", "card-3");
    expect(result[0].cardIds).toEqual(["card-1"]);
    expect(result[1].cardIds).toEqual(["card-2", "card-3"]);
  });

  it("drops cards to the end of a column", () => {
    const result = moveCard(baseColumns, "card-1", "col-b");
    expect(result[0].cardIds).toEqual(["card-2"]);
    expect(result[1].cardIds).toEqual(["card-3", "card-1"]);
  });

  it("returns the columns unchanged when the card is dropped on itself", () => {
    const result = moveCard(baseColumns, "card-1", "card-1");
    expect(result).toBe(baseColumns);
  });

  it("returns the columns unchanged for an unknown active id", () => {
    const result = moveCard(baseColumns, "card-missing", "card-1");
    expect(result).toBe(baseColumns);
  });

  it("returns the columns unchanged for an unknown over id", () => {
    const result = moveCard(baseColumns, "card-1", "card-missing");
    expect(result).toBe(baseColumns);
  });

  it("moves a card to the end of its own column when dropped on that column", () => {
    const result = moveCard(baseColumns, "card-1", "col-a");
    expect(result[0].cardIds).toEqual(["card-2", "card-1"]);
  });

  it("does not mutate the columns it is given", () => {
    const before = JSON.stringify(baseColumns);
    moveCard(baseColumns, "card-2", "card-3");
    expect(JSON.stringify(baseColumns)).toBe(before);
  });
});

describe("createId", () => {
  it("uses the prefix given", () => {
    expect(createId("card")).toMatch(/^card-/);
  });

  it("does not repeat ids", () => {
    const ids = new Set(Array.from({ length: 50 }, () => createId("card")));
    expect(ids.size).toBe(50);
  });
});
