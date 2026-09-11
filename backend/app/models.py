from collections import Counter
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

# The whole board is serialised into the AI prompt on every chat turn, so its size is
# an upstream cost as well as a storage question. Generous for one board, and far
# below anything that would make a prompt expensive.
MAX_COLUMNS = 20
MAX_CARDS = 500
MAX_TITLE_LENGTH = 200
MAX_DETAILS_LENGTH = 2000
MAX_BOARD_NAME_LENGTH = 100
MAX_LABELS = 10
MAX_LABEL_LENGTH = 30

Priority = Literal["low", "medium", "high"]


class Card(BaseModel):
    id: str
    title: str = Field(max_length=MAX_TITLE_LENGTH)
    details: str = Field(default="", max_length=MAX_DETAILS_LENGTH)
    priority: Priority | None = None
    dueDate: str | None = Field(default=None, max_length=10)
    labels: list[str] = Field(default_factory=list, max_length=MAX_LABELS)

    @field_validator("title")
    @classmethod
    def title_is_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Card title cannot be blank")
        return value

    @field_validator("dueDate")
    @classmethod
    def due_date_is_iso(cls, value: str | None) -> str | None:
        if value is None:
            return value
        try:
            date.fromisoformat(value)
        except ValueError as error:
            raise ValueError("dueDate must be an ISO date (YYYY-MM-DD)") from error
        return value

    @field_validator("labels")
    @classmethod
    def labels_are_clean(cls, value: list[str]) -> list[str]:
        cleaned = [label.strip() for label in value]
        if any(not label for label in cleaned):
            raise ValueError("Labels cannot be blank")
        if any(len(label) > MAX_LABEL_LENGTH for label in cleaned):
            raise ValueError(f"Labels cannot exceed {MAX_LABEL_LENGTH} characters")
        return cleaned


class Column(BaseModel):
    id: str
    title: str = Field(max_length=MAX_TITLE_LENGTH)
    cardIds: list[str]

    @field_validator("title")
    @classmethod
    def title_is_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Column title cannot be blank")
        return value


class BoardData(BaseModel):
    """The whole board. Field names match the frontend's BoardData exactly."""

    columns: list[Column] = Field(max_length=MAX_COLUMNS)
    cards: dict[str, Card] = Field(max_length=MAX_CARDS)

    @model_validator(mode="after")
    def check_invariants(self) -> "BoardData":
        # The invariants are spelled out in docs/DATABASE.md. SQLite cannot enforce
        # anything inside a JSON column, so they are enforced here on every write.
        placed = [card_id for column in self.columns for card_id in column.cardIds]

        missing = [card_id for card_id in placed if card_id not in self.cards]
        if missing:
            raise ValueError(f"cardIds reference cards that do not exist: {missing}")

        duplicated = sorted(
            card_id for card_id, seen in Counter(placed).items() if seen > 1
        )
        if duplicated:
            raise ValueError(f"cards appear in more than one place: {duplicated}")

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


class BoardSummary(BaseModel):
    """A board without its contents, for listing and switching between boards."""

    id: int
    name: str
    updatedAt: str


class BoardCreate(BaseModel):
    name: str = Field(default="New board", max_length=MAX_BOARD_NAME_LENGTH)

    @field_validator("name")
    @classmethod
    def name_is_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Board name cannot be blank")
        return value


class BoardRename(BaseModel):
    name: str = Field(max_length=MAX_BOARD_NAME_LENGTH)

    @field_validator("name")
    @classmethod
    def name_is_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Board name cannot be blank")
        return value


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
            "priority": "high",
            "dueDate": "2026-09-25",
            "labels": ["roadmap", "q3"],
        },
        "card-2": {
            "id": "card-2",
            "title": "Gather customer signals",
            "details": "Review support tags, sales notes, and churn feedback.",
            "priority": "medium",
            "dueDate": None,
            "labels": ["research"],
        },
        "card-3": {
            "id": "card-3",
            "title": "Prototype analytics view",
            "details": "Sketch initial dashboard layout and key drill-downs.",
            "priority": "medium",
            "dueDate": None,
            "labels": [],
        },
        "card-4": {
            "id": "card-4",
            "title": "Refine status language",
            "details": "Standardize column labels and tone across the board.",
            "priority": "low",
            "dueDate": None,
            "labels": [],
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
