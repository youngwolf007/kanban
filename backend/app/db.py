import hashlib
import json
import os
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent.parent

DEFAULT_USERNAME = "user"
DEFAULT_PASSWORD = "password"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS boards (
    id INTEGER PRIMARY KEY,
    user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


def db_path() -> Path:
    # Read at call time, not import time, so tests can point at a temp file.
    return Path(os.getenv("DB_PATH", REPO_ROOT / "pm.db"))


@contextmanager
def connect():
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(path)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    finally:
        connection.close()


def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    digest = hashlib.scrypt(password.encode(), salt=salt.encode(), n=16384, r=8, p=1)
    return f"{salt}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    salt, digest = stored.split("$")
    candidate = hashlib.scrypt(
        password.encode(), salt=salt.encode(), n=16384, r=8, p=1
    )
    return secrets.compare_digest(candidate.hex(), digest)


def get_user_by_username(username: str) -> sqlite3.Row | None:
    with connect() as connection:
        return connection.execute(
            "SELECT * FROM users WHERE username = ?", (username,)
        ).fetchone()


def get_user_by_id(user_id: int) -> sqlite3.Row | None:
    with connect() as connection:
        return connection.execute(
            "SELECT * FROM users WHERE id = ?", (user_id,)
        ).fetchone()


def create_user(username: str, password: str) -> int:
    with connect() as connection:
        cursor = connection.execute(
            "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)",
            (
                username,
                hash_password(password),
                datetime.now(timezone.utc).isoformat(),
            ),
        )
        return cursor.lastrowid


def get_board(user_id: int) -> dict | None:
    """The user's board, or None if they have never had one."""
    with connect() as connection:
        row = connection.execute(
            "SELECT data FROM boards WHERE user_id = ?", (user_id,)
        ).fetchone()
    return json.loads(row["data"]) if row else None


def save_board(user_id: int, board: dict) -> None:
    """Replace the user's board, inserting it the first time."""
    with connect() as connection:
        connection.execute(
            """
            INSERT INTO boards (user_id, data, updated_at) VALUES (?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET data = excluded.data,
                                               updated_at = excluded.updated_at
            """,
            (user_id, json.dumps(board), datetime.now(timezone.utc).isoformat()),
        )


def init_db() -> None:
    """Create the database and seed the MVP user if they are not there yet."""
    with connect() as connection:
        connection.executescript(SCHEMA)

    if get_user_by_username(DEFAULT_USERNAME) is None:
        create_user(DEFAULT_USERNAME, DEFAULT_PASSWORD)
