import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.db import (
    get_user_by_id,
    get_user_by_username,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# An unknown username is checked against this, so login does the same hashing work
# either way and its response time does not say whether a username exists.
UNUSABLE_HASH = hash_password("no account has this password")


class Credentials(BaseModel):
    username: str
    password: str


def require_user(request: Request) -> sqlite3.Row:
    """Dependency for any route that needs a signed-in user."""
    user_id = request.session.get("user_id")
    user = get_user_by_id(user_id) if user_id is not None else None
    if user is None:
        request.session.clear()
        raise HTTPException(status_code=401, detail="Not signed in")
    return user


@router.post("/login")
def login(credentials: Credentials, request: Request) -> dict[str, str]:
    user = get_user_by_username(credentials.username)
    stored = user["password_hash"] if user is not None else UNUSABLE_HASH
    # Verify first, unconditionally: short circuiting on a missing user would skip the
    # hashing and give the timing away.
    if not verify_password(credentials.password, stored) or user is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    request.session["user_id"] = user["id"]
    return {"username": user["username"]}


@router.post("/logout")
def logout(request: Request) -> dict[str, str]:
    request.session.clear()
    return {"status": "signed out"}


@router.get("/me")
def me(user: sqlite3.Row = Depends(require_user)) -> dict[str, str]:
    return {"username": user["username"]}
