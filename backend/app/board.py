import sqlite3

from fastapi import APIRouter, Depends

from app.auth import require_user
from app.db import get_board, save_board
from app.models import DEFAULT_BOARD, BoardData

router = APIRouter(prefix="/api", tags=["board"])


@router.get("/board")
def read_board(user: sqlite3.Row = Depends(require_user)) -> BoardData:
    """The user's board, seeded with the demo board on first read."""
    board = get_board(user["id"])
    if board is None:
        board = DEFAULT_BOARD
        save_board(user["id"], board)
    return BoardData.model_validate(board)


@router.put("/board")
def replace_board(
    board: BoardData, user: sqlite3.Row = Depends(require_user)
) -> BoardData:
    """Replace the whole board. Invalid boards are rejected with 422 before any write."""
    save_board(user["id"], board.model_dump())
    return board
