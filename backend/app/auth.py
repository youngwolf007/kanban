import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field, field_validator

from app.db import (
    create_user,
    get_user_by_id,
    get_user_by_username,
    hash_password,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

# An unknown username is checked against this, so login does the same hashing work
# either way and its response time does not say whether an account exists.
UNUSABLE_HASH = hash_password("no account has this password")

MIN_PASSWORD_LENGTH = 8
MAX_USERNAME_LENGTH = 50
MAX_PASSWORD_LENGTH = 200


class Credentials(BaseModel):
    username: str
    password: str


class Registration(BaseModel):
    username: str = Field(min_length=1, max_length=MAX_USERNAME_LENGTH)
    password: str = Field(min_length=MIN_PASSWORD_LENGTH, max_length=MAX_PASSWORD_LENGTH)

    @field_validator("username")
    @classmethod
    def username_is_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Username cannot be blank")
        return value


def require_user(request: Request) -> sqlite3.Row:
    """Dependency for any route that needs a signed-in user."""
    user_id = request.session.get("user_id")
    user = get_user_by_id(user_id) if user_id is not None else None
    if user is None:
        request.session.clear()
        raise HTTPException(status_code=401, detail="Not signed in")
    return user


@router.post("/register", status_code=201)
def register(registration: Registration, request: Request) -> dict[str, str | int]:
    if get_user_by_username(registration.username) is not None:
        raise HTTPException(status_code=409, detail="Username is taken")

    try:
        user_id = create_user(registration.username, registration.password)
    except sqlite3.IntegrityError as error:
        # A second request for the same username can win the race between the check
        # above and this insert; the UNIQUE constraint is the final word.
        raise HTTPException(status_code=409, detail="Username is taken") from error

    request.session["user_id"] = user_id
    return {"id": user_id, "username": registration.username}


@router.post("/login")
def login(credentials: Credentials, request: Request) -> dict[str, str | int]:
    user = get_user_by_username(credentials.username)
    stored = user["password_hash"] if user is not None else UNUSABLE_HASH
    # Verify first, unconditionally: short circuiting on a missing user would skip the
    # hashing and give the timing away.
    if not verify_password(credentials.password, stored) or user is None:
        raise HTTPException(status_code=401, detail="Invalid username or password")

    request.session["user_id"] = user["id"]
    return {"id": user["id"], "username": user["username"]}


@router.post("/logout")
def logout(request: Request) -> dict[str, str]:
    request.session.clear()
    return {"status": "signed out"}


@router.get("/me")
def me(user: sqlite3.Row = Depends(require_user)) -> dict[str, str | int]:
    return {"id": user["id"], "username": user["username"]}
