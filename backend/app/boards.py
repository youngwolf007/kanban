import sqlite3

from fastapi import APIRouter, Depends, HTTPException

from app.auth import require_user
from app.db import (
    add_board_member,
    create_board,
    delete_board,
    get_board,
    get_board_summary,
    get_user_by_username,
    has_board_access,
    is_board_owner,
    list_board_members,
    list_boards,
    remove_board_member,
    rename_board,
    save_board,
)
from app.models import (
    DEFAULT_BOARD,
    BoardCreate,
    BoardData,
    BoardMember,
    BoardRename,
    BoardSummary,
    MemberInvite,
)

router = APIRouter(prefix="/api/boards", tags=["boards"])


def to_summary(row: sqlite3.Row, user_id: int) -> BoardSummary:
    """A list_boards row, which always carries owner_id and owner_username."""
    return BoardSummary(
        id=row["id"],
        name=row["name"],
        updatedAt=row["updated_at"],
        isOwner=row["owner_id"] == user_id,
        ownerUsername=row["owner_username"],
    )


def load_board(board_id: int, user_id: int) -> BoardData:
    """The board's data. Raises 404 if it does not exist or is inaccessible."""
    data = get_board(board_id, user_id)
    if data is None:
        raise HTTPException(status_code=404, detail="Board not found")
    return BoardData.model_validate(data)


def require_access(board_id: int, user_id: int) -> None:
    """Raises 404 for a board the user cannot see at all."""
    if not has_board_access(board_id, user_id):
        raise HTTPException(status_code=404, detail="Board not found")


def require_ownership(board_id: int, user_id: int) -> None:
    """Raises 404 with no access, 403 for a member who is not the owner."""
    require_access(board_id, user_id)
    if not is_board_owner(board_id, user_id):
        raise HTTPException(
            status_code=403, detail="Only the board's owner can do that"
        )


@router.get("")
def read_boards(user: sqlite3.Row = Depends(require_user)) -> list[BoardSummary]:
    return [to_summary(row, user["id"]) for row in list_boards(user["id"])]


@router.post("", status_code=201)
def create_new_board(
    payload: BoardCreate, user: sqlite3.Row = Depends(require_user)
) -> BoardSummary:
    board_id = create_board(user["id"], payload.name, DEFAULT_BOARD)
    row = get_board_summary(board_id, user["id"])
    assert row is not None
    return BoardSummary(
        id=row["id"],
        name=row["name"],
        updatedAt=row["updated_at"],
        isOwner=True,
        ownerUsername=user["username"],
    )


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
    require_ownership(board_id, user["id"])
    renamed = rename_board(board_id, user["id"], payload.name)
    assert renamed
    row = get_board_summary(board_id, user["id"])
    assert row is not None
    return BoardSummary(
        id=row["id"],
        name=row["name"],
        updatedAt=row["updated_at"],
        isOwner=True,
        ownerUsername=user["username"],
    )


@router.delete("/{board_id}", status_code=204)
def delete_existing_board(
    board_id: int, user: sqlite3.Row = Depends(require_user)
) -> None:
    require_ownership(board_id, user["id"])
    deleted = delete_board(board_id, user["id"])
    assert deleted


@router.get("/{board_id}/members")
def read_members(
    board_id: int, user: sqlite3.Row = Depends(require_user)
) -> list[BoardMember]:
    require_access(board_id, user["id"])
    return [
        BoardMember(userId=row["user_id"], username=row["username"])
        for row in list_board_members(board_id)
    ]


@router.post("/{board_id}/members", status_code=201)
def add_member(
    board_id: int, payload: MemberInvite, user: sqlite3.Row = Depends(require_user)
) -> list[BoardMember]:
    require_ownership(board_id, user["id"])

    invitee = get_user_by_username(payload.username)
    if invitee is None:
        raise HTTPException(status_code=404, detail="No user with that username")
    if invitee["id"] == user["id"]:
        raise HTTPException(status_code=409, detail="You already own this board")

    members = list_board_members(board_id)
    if any(row["user_id"] == invitee["id"] for row in members):
        raise HTTPException(status_code=409, detail="Already a member of this board")

    add_board_member(board_id, invitee["id"])
    return [
        BoardMember(userId=row["user_id"], username=row["username"])
        for row in list_board_members(board_id)
    ]


@router.delete("/{board_id}/members/{member_id}", status_code=204)
def remove_member(
    board_id: int, member_id: int, user: sqlite3.Row = Depends(require_user)
) -> None:
    require_access(board_id, user["id"])
    # The owner can remove any member; a member may remove only themselves ("leave").
    if not is_board_owner(board_id, user["id"]) and member_id != user["id"]:
        raise HTTPException(
            status_code=403, detail="Only the board's owner can remove other members"
        )
    if not remove_board_member(board_id, member_id):
        raise HTTPException(status_code=404, detail="Not a member of this board")
