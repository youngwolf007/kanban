import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.db import get_user_by_id, get_user_by_username, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


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
    if user is None or not verify_password(
        credentials.password, user["password_hash"]
    ):
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
