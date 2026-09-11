import {
  createId,
  hasActiveFilters,
  isOverdue,
  matchesFilters,
  moveCard,
  parseLabels,
  type Card,
  type Column,
} from "@/lib/kanban";

const card = (overrides: Partial<Card> = {}): Card => ({
  id: "card-1",
  title: "Align roadmap themes",
  details: "Draft the quarterly plan",
  priority: "high",
  dueDate: null,
  labels: ["roadmap", "q3"],
  ...overrides,
});

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

describe("parseLabels", () => {
  it("splits on commas and trims whitespace", () => {
    expect(parseLabels(" urgent ,  q3, roadmap ")).toEqual([
      "urgent",
      "q3",
      "roadmap",
    ]);
  });

  it("drops blank entries", () => {
    expect(parseLabels("urgent,, ,roadmap")).toEqual(["urgent", "roadmap"]);
  });

  it("returns an empty list for blank input", () => {
    expect(parseLabels("   ")).toEqual([]);
  });
});

describe("isOverdue", () => {
  it("is false for no due date", () => {
    expect(isOverdue(null, "2026-09-11")).toBe(false);
  });

  it("is false for a due date today or later", () => {
    expect(isOverdue("2026-09-11", "2026-09-11")).toBe(false);
    expect(isOverdue("2026-09-12", "2026-09-11")).toBe(false);
  });

  it("is true for a due date in the past", () => {
    expect(isOverdue("2026-09-10", "2026-09-11")).toBe(true);
  });
});

describe("matchesFilters", () => {
  it("matches everything when no filter is set", () => {
    expect(matchesFilters(card(), { query: "", priority: "all" })).toBe(true);
  });

  it("matches on title, case-insensitively", () => {
    expect(matchesFilters(card(), { query: "ROADMAP", priority: "all" })).toBe(true);
  });

  it("matches on details", () => {
    expect(matchesFilters(card(), { query: "quarterly", priority: "all" })).toBe(true);
  });

  it("matches on a label", () => {
    expect(matchesFilters(card(), { query: "q3", priority: "all" })).toBe(true);
  });

  it("does not match unrelated text", () => {
    expect(matchesFilters(card(), { query: "nothing here", priority: "all" })).toBe(
      false
    );
  });

  it("filters by priority", () => {
    expect(matchesFilters(card({ priority: "low" }), { query: "", priority: "high" })).toBe(
      false
    );
    expect(matchesFilters(card({ priority: "high" }), { query: "", priority: "high" })).toBe(
      true
    );
  });

  it("requires both query and priority to match when both are set", () => {
    const filters = { query: "roadmap", priority: "low" as const };
    expect(matchesFilters(card({ priority: "high" }), filters)).toBe(false);
    expect(matchesFilters(card({ priority: "low" }), filters)).toBe(true);
  });
});

describe("hasActiveFilters", () => {
  it("is false for the empty filters", () => {
    expect(hasActiveFilters({ query: "", priority: "all" })).toBe(false);
    expect(hasActiveFilters({ query: "   ", priority: "all" })).toBe(false);
  });

  it("is true once a query or priority is set", () => {
    expect(hasActiveFilters({ query: "milk", priority: "all" })).toBe(true);
    expect(hasActiveFilters({ query: "", priority: "high" })).toBe(true);
  });
});
