import hashlib
import json
import os
import secrets
import sqlite3
from contextlib import contextmanager
from datetime import UTC, datetime
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
    user_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
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
    salt, _, digest = stored.partition("$")
    if not digest:
        return False
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
                datetime.now(UTC).isoformat(),
            ),
        )
        # An INSERT into a rowid table always sets this; the type is Optional because
        # other statements do not.
        assert cursor.lastrowid is not None
        return cursor.lastrowid


def list_boards(user_id: int) -> list[sqlite3.Row]:
    """Every board owned by the user, most recently updated first."""
    with connect() as connection:
        return connection.execute(
            "SELECT id, name, updated_at FROM boards"
            " WHERE user_id = ? ORDER BY updated_at DESC",
            (user_id,),
        ).fetchall()


def get_board_summary(board_id: int, user_id: int) -> sqlite3.Row | None:
    with connect() as connection:
        return connection.execute(
            "SELECT id, name, updated_at FROM boards WHERE id = ? AND user_id = ?",
            (board_id, user_id),
        ).fetchone()


def create_board(user_id: int, name: str, data: dict) -> int:
    now = datetime.now(UTC).isoformat()
    with connect() as connection:
        cursor = connection.execute(
            "INSERT INTO boards (user_id, name, data, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, ?)",
            (user_id, name, json.dumps(data), now, now),
        )
        assert cursor.lastrowid is not None
        return cursor.lastrowid


def get_board(board_id: int, user_id: int) -> dict | None:
    """The board's data, or None if it does not exist or belongs to someone else."""
    with connect() as connection:
        row = connection.execute(
            "SELECT data FROM boards WHERE id = ? AND user_id = ?",
            (board_id, user_id),
        ).fetchone()
    return json.loads(row["data"]) if row else None


def save_board(board_id: int, user_id: int, data: dict) -> bool:
    """Replace the board's data. Returns False if it does not exist or is not owned."""
    with connect() as connection:
        cursor = connection.execute(
            "UPDATE boards SET data = ?, updated_at = ? WHERE id = ? AND user_id = ?",
            (json.dumps(data), datetime.now(UTC).isoformat(), board_id, user_id),
        )
    return cursor.rowcount > 0


def rename_board(board_id: int, user_id: int, name: str) -> bool:
    """Returns False if the board does not exist or is not owned."""
    with connect() as connection:
        cursor = connection.execute(
            "UPDATE boards SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?",
            (name, datetime.now(UTC).isoformat(), board_id, user_id),
        )
    return cursor.rowcount > 0


def delete_board(board_id: int, user_id: int) -> bool:
    """Returns False if the board does not exist or is not owned."""
    with connect() as connection:
        cursor = connection.execute(
            "DELETE FROM boards WHERE id = ? AND user_id = ?", (board_id, user_id)
        )
    return cursor.rowcount > 0


def init_db() -> None:
    """Create the database and seed the demo user if they are not there yet."""
    with connect() as connection:
        connection.executescript(SCHEMA)

    if get_user_by_username(DEFAULT_USERNAME) is None:
        create_user(DEFAULT_USERNAME, DEFAULT_PASSWORD)
