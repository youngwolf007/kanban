from pydantic import BaseModel, field_validator, model_validator


class Card(BaseModel):
    id: str
    title: str
    details: str = ""

    @field_validator("title")
    @classmethod
    def title_is_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Card title cannot be blank")
        return value


class Column(BaseModel):
    id: str
    title: str
    cardIds: list[str]

    @field_validator("title")
    @classmethod
    def title_is_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Column title cannot be blank")
        return value


class BoardData(BaseModel):
    """The whole board. Field names match the frontend's BoardData exactly."""

    columns: list[Column]
    cards: dict[str, Card]

    @model_validator(mode="after")
    def check_invariants(self) -> "BoardData":
        # The invariants are spelled out in docs/DATABASE.md. SQLite cannot enforce
        # anything inside a JSON column, so they are enforced here on every write.
        placed = [card_id for column in self.columns for card_id in column.cardIds]

        missing = [card_id for card_id in placed if card_id not in self.cards]
        if missing:
            raise ValueError(f"cardIds reference cards that do not exist: {missing}")

        duplicated = {card_id for card_id in placed if placed.count(card_id) > 1}
        if duplicated:
            raise ValueError(f"cards appear in more than one place: {sorted(duplicated)}")

        orphaned = sorted(set(self.cards) - set(placed))
        if orphaned:
            raise ValueError(f"cards are in no column: {orphaned}")

        mismatched = sorted(key for key, card in self.cards.items() if card.id != key)
        if mismatched:
            raise ValueError(f"card ids do not match their keys: {mismatched}")

        column_ids = [column.id for column in self.columns]
        if len(column_ids) != len(set(column_ids)):
            raise ValueError("column ids must be unique")

        return self


DEFAULT_BOARD = {
    "columns": [
        {"id": "col-backlog", "title": "Backlog", "cardIds": ["card-1", "card-2"]},
        {"id": "col-discovery", "title": "Discovery", "cardIds": ["card-3"]},
        {"id": "col-progress", "title": "In Progress", "cardIds": ["card-4", "card-5"]},
        {"id": "col-review", "title": "Review", "cardIds": ["card-6"]},
        {"id": "col-done", "title": "Done", "cardIds": ["card-7", "card-8"]},
    ],
    "cards": {
        "card-1": {
            "id": "card-1",
            "title": "Align roadmap themes",
            "details": "Draft quarterly themes with impact statements and metrics.",
        },
        "card-2": {
            "id": "card-2",
            "title": "Gather customer signals",
            "details": "Review support tags, sales notes, and churn feedback.",
        },
        "card-3": {
            "id": "card-3",
            "title": "Prototype analytics view",
            "details": "Sketch initial dashboard layout and key drill-downs.",
        },
        "card-4": {
            "id": "card-4",
            "title": "Refine status language",
            "details": "Standardize column labels and tone across the board.",
        },
        "card-5": {
            "id": "card-5",
            "title": "Design card layout",
            "details": "Add hierarchy and spacing for scanning dense lists.",
        },
        "card-6": {
            "id": "card-6",
            "title": "QA micro-interactions",
            "details": "Verify hover, focus, and loading states.",
        },
        "card-7": {
            "id": "card-7",
            "title": "Ship marketing page",
            "details": "Final copy approved and asset pack delivered.",
        },
        "card-8": {
            "id": "card-8",
            "title": "Close onboarding sprint",
            "details": "Document release notes and share internally.",
        },
    },
}
