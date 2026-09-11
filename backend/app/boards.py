import sqlite3

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_user
from app.db import (
    create_board,
    delete_board,
    get_board,
    get_board_summary,
    list_boards,
    rename_board,
    save_board,
)
from app.models import DEFAULT_BOARD, BoardCreate, BoardData, BoardRename, BoardSummary

router = APIRouter(prefix="/api/boards", tags=["boards"])


def to_summary(row: sqlite3.Row) -> BoardSummary:
    return BoardSummary(id=row["id"], name=row["name"], updatedAt=row["updated_at"])


def load_board(board_id: int, user_id: int) -> BoardData:
    """The board's data. Raises 404 if it does not exist or belongs to someone else."""
    data = get_board(board_id, user_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Board not found")
    return BoardData.model_validate(data)


@router.get("")
def read_boards(user: sqlite3.Row = Depends(require_user)) -> list[BoardSummary]:
    return [to_summary(row) for row in list_boards(user["id"])]


@router.post("", status_code=201)
def create_new_board(
    payload: BoardCreate, user: sqlite3.Row = Depends(require_user)
) -> BoardSummary:
    board_id = create_board(user["id"], payload.name, DEFAULT_BOARD)
    row = get_board_summary(board_id, user["id"])
    assert row is not None
    return to_summary(row)


@router.get("/{board_id}")
def read_board(board_id: int, user: sqlite3.Row = Depends(require_user)) -> BoardData:
    return load_board(board_id, user["id"])


@router.put("/{board_id}")
def replace_board(
    board_id: int, board: BoardData, user: sqlite3.Row = Depends(require_user)
) -> BoardData:
    """Replace the whole board. Invalid boards are rejected with 422 before any write."""
    if not save_board(board_id, user["id"], board.model_dump()):
        raise HTTPException(status_code=404, detail="Board not found")
    return board


@router.patch("/{board_id}")
def rename_existing_board(
    board_id: int, payload: BoardRename, user: sqlite3.Row = Depends(require_user)
) -> BoardSummary:
    if not rename_board(board_id, user["id"], payload.name):
        raise HTTPException(status_code=404, detail="Board not found")
    row = get_board_summary(board_id, user["id"])
    assert row is not None
    return to_summary(row)


@router.delete("/{board_id}", status_code=204)
def delete_existing_board(
    board_id: int, user: sqlite3.Row = Depends(require_user)
) -> None:
    if not delete_board(board_id, user["id"]):
        raise HTTPException(status_code=404, detail="Board not found")
