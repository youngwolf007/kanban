import sqlite3

from fastapi import APIRouter, Depends

from app.auth import require_user
from app.db import get_board, save_board
from app.models import DEFAULT_BOARD, BoardData

router = APIRouter(prefix="/api", tags=["board"])


def load_board(user_id: int) -> BoardData:
    """The user's board, seeded with the demo board if they have none yet."""
    board = get_board(user_id)
    if board is None:
        board = DEFAULT_BOARD
        save_board(user_id, board)
    return BoardData.model_validate(board)


@router.get("/board")
def read_board(user: sqlite3.Row = Depends(require_user)) -> BoardData:
    """The user's board, seeded with the demo board on first read."""
    return load_board(user["id"])


@router.put("/board")
def replace_board(
    board: BoardData, user: sqlite3.Row = Depends(require_user)
) -> BoardData:
    """Replace the whole board. Invalid boards are rejected with 422 before any write."""
    save_board(user["id"], board.model_dump())
    return board
