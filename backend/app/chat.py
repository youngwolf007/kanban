import json
import sqlite3
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from app.ai import AIError, ask
from app.auth import require_user
from app.boards import load_board
from app.db import save_board
from app.models import BoardData

router = APIRouter(prefix="/api", tags=["chat"])

# Keeps the prompt bounded. The client sends its whole transcript; only the tail is used.
MAX_HISTORY = 20

# Longer than this is not a kanban instruction, and every character is paid for
# upstream. The cap applies to the history too, which the client also supplies.
MAX_MESSAGE_LENGTH = 4000

# gpt-oss is a reasoning model, and roughly one call in ten finishes with its answer left in
# the reasoning channel and no content at all, despite finish_reason "stop". Each attempt is
# routed afresh by OpenRouter, so a retry usually lands on a provider that answers properly.
# Three bounds the wait at roughly a minute and a half in the worst case, while making a
# whole-request failure rare.
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
    content: str = Field(max_length=MAX_MESSAGE_LENGTH)


class ChatRequest(BaseModel):
    board_id: int
    message: str = Field(max_length=MAX_MESSAGE_LENGTH)
    history: list[Message] = []


class ChatResponse(BaseModel):
    """`board` is set only when the AI changed it, so the client knows to refresh."""

    reply: str
    board: BoardData | None = None


def to_model_shape(board: BoardData) -> dict:
    """The stored board, with its cards flattened to the array the model exchanges."""
    data = board.model_dump()
    return {"columns": data["columns"], "cards": list(data["cards"].values())}


def to_stored_shape(board: object) -> dict:
    """The model's board, with its cards keyed by id ready for BoardData.

    Raises for the things BoardData cannot judge for itself: ValueError for a board
    that is not an object at all, or for two cards sharing an id, which would collapse
    into one on the way into the map and leave a valid board missing a card; KeyError
    for a card missing its own id; TypeError for a card that is not an object. The
    caller catches all three alongside BoardData's own ValidationError.
    """
    if not isinstance(board, dict):
        raise ValueError("board is not an object")

    cards: dict[str, object] = {}
    for card in board.get("cards", []):
        card_id = card["id"]
        if card_id in cards:
            raise ValueError(f"card id used more than once: {card_id}")
        cards[card_id] = card

    return {"columns": board.get("columns", []), "cards": cards}


def ask_for_json(messages: list[dict]) -> dict:
    """One structured answer from the model, retried up to ATTEMPTS times.

    Every failure here is worth another attempt, because OpenRouter routes each one
    afresh: an unusable answer and a provider that timed out are both usually fixed
    by landing somewhere else. The status of the last failure is what the caller sees.
    """
    status, detail = 502, "The AI returned a malformed response"
    for _ in range(ATTEMPTS):
        try:
            answer = ask(messages, response_format=RESPONSE_SCHEMA)
        except AIError as error:
            status, detail = 503, str(error)
            continue

        try:
            data = json.loads(answer)
        except json.JSONDecodeError:
            status, detail = 502, "The AI returned a malformed response"
            continue

        # Providers vary on whether they honour the schema's required keys, so check for
        # something usable rather than assuming either key is present.
        if not isinstance(data, dict) or not (data.get("reply") or data.get("board")):
            status, detail = 502, "The AI returned an empty response"
            continue

        return data

    raise HTTPException(status_code=status, detail=detail)


@router.post("/chat")
def chat(
    request: ChatRequest, user: sqlite3.Row = Depends(require_user)
) -> ChatResponse:
    board = load_board(request.board_id, user["id"])
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
    except (ValueError, KeyError, TypeError) as error:
        # ValueError covers both pydantic's ValidationError and the shaping above.
        raise HTTPException(
            status_code=502, detail="The AI returned an invalid board"
        ) from error

    # An empty board validates cleanly (no invariant is violated by nothing), but it is
    # never a real answer: it means the model dropped the board, not that the user asked
    # to clear it. Treat it the same as a malformed board rather than saving it.
    if not updated.columns and not updated.cards:
        raise HTTPException(status_code=502, detail="The AI returned an invalid board")

    save_board(request.board_id, user["id"], updated.model_dump())
    return ChatResponse(reply=reply or "Board updated.", board=updated)
