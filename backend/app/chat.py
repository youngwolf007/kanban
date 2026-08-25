import json
import sqlite3
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ValidationError

from app.ai import AIError, ask
from app.auth import require_user
from app.board import load_board
from app.db import save_board
from app.models import BoardData

router = APIRouter(prefix="/api", tags=["chat"])

# Keeps the prompt bounded. The client sends its whole transcript; only the tail is used.
MAX_HISTORY = 20

# gpt-oss is a reasoning model, and roughly one call in ten finishes with its answer left in
# the reasoning channel and no content at all, despite finish_reason "stop". Each attempt is
# routed afresh by OpenRouter, so a retry usually lands on a provider that answers properly.
# Three bounds the wait at roughly a minute and a half in the worst case, while making a
# whole-request failure rare. See the Part 9 notes in docs/PLAN.md.
ATTEMPTS = 3

CARD_SCHEMA = {
    "type": "object",
    "properties": {
        "id": {"type": "string"},
        "title": {"type": "string"},
        "details": {"type": "string"},
    },
    "required": ["id", "title", "details"],
    "additionalProperties": False,
}

COLUMN_SCHEMA = {
    "type": "object",
    "properties": {
        "id": {"type": "string"},
        "title": {"type": "string"},
        "cardIds": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["id", "title", "cardIds"],
    "additionalProperties": False,
}

# Cards travel as an array, never as the stored id-keyed map: a JSON Schema cannot say that
# a map's key must equal its card's id, and the model keyed them arbitrarily when asked.
# The Part 8 notes in docs/PLAN.md have the measurements.
RESPONSE_SCHEMA = {
    "type": "json_schema",
    "json_schema": {
        "name": "board_reply",
        "strict": True,
        "schema": {
            "type": "object",
            "properties": {
                "reply": {"type": "string"},
                "board": {
                    "type": ["object", "null"],
                    "properties": {
                        "columns": {"type": "array", "items": COLUMN_SCHEMA},
                        "cards": {"type": "array", "items": CARD_SCHEMA},
                    },
                    "required": ["columns", "cards"],
                    "additionalProperties": False,
                },
            },
            "required": ["reply", "board"],
            "additionalProperties": False,
        },
    },
}

SYSTEM_PROMPT = """You manage one kanban board for the user you are talking to.

Answer in `reply`, in plain sentences with no markdown.

Set `board` to null unless the user asked you to change the board. Questions about the
board are answered from the JSON below with `board` set to null.

When the user does ask for a change, return the COMPLETE board in `board`: every column
and every card, including the ones you did not touch. A partial board loses the rest.

Nothing changes unless you return a board. Saying you added, moved, renamed or deleted
something while `board` is null is a lie: the board is left exactly as it was. If your
reply describes a change, `board` must carry the full updated board.

Rules the board must obey, or the change is refused:
- Keep the id of every column and card that already exists.
- Give a new card an id that is not already taken, such as card-9.
- Every id in a column's cardIds must match a card in cards, and every card must appear in
  exactly one column's cardIds.
- A card's own id field must match the id used in cardIds.
- Titles cannot be empty. Details may be.
- Do not add or remove columns unless you are asked to.

The current board:
"""


class Message(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[Message] = []


class ChatResponse(BaseModel):
    """`board` is set only when the AI changed it, so the client knows to refresh."""

    reply: str
    board: BoardData | None = None


def to_model_shape(board: BoardData) -> dict:
    """The stored board, with its cards flattened to the array the model exchanges."""
    data = board.model_dump()
    return {"columns": data["columns"], "cards": list(data["cards"].values())}


def to_stored_shape(board: dict) -> dict:
    """The model's board, with its cards keyed by id ready for BoardData."""
    return {
        "columns": board.get("columns", []),
        "cards": {card["id"]: card for card in board.get("cards", [])},
    }


def ask_for_json(messages: list[dict]) -> dict:
    """One structured answer from the model, retried once if it comes back unusable."""
    detail = "The AI returned a malformed response"
    for _ in range(ATTEMPTS):
        try:
            answer = ask(messages, response_format=RESPONSE_SCHEMA)
        except AIError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error

        try:
            data = json.loads(answer)
        except json.JSONDecodeError:
            detail = "The AI returned a malformed response"
            continue

        # Providers vary on whether they honour the schema's required keys, so check for
        # something usable rather than assuming either key is present.
        if not isinstance(data, dict) or not (data.get("reply") or data.get("board")):
            detail = "The AI returned an empty response"
            continue

        return data

    raise HTTPException(status_code=502, detail=detail)


@router.post("/chat")
def chat(
    request: ChatRequest, user: sqlite3.Row = Depends(require_user)
) -> ChatResponse:
    board = load_board(user["id"])
    prompt = SYSTEM_PROMPT + json.dumps(to_model_shape(board))
    messages = [{"role": "system", "content": prompt}]
    messages += [message.model_dump() for message in request.history[-MAX_HISTORY:]]
    messages.append({"role": "user", "content": request.message})

    data = ask_for_json(messages)
    reply = data.get("reply") or ""
    returned = data.get("board")

    if returned is None:
        return ChatResponse(reply=reply)

    try:
        updated = BoardData.model_validate(to_stored_shape(returned))
    except (ValidationError, KeyError, TypeError) as error:
        raise HTTPException(
            status_code=502, detail="The AI returned an invalid board"
        ) from error

    save_board(user["id"], updated.model_dump())
    return ChatResponse(reply=reply or "Board updated.", board=updated)
