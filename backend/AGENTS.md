# Backend

FastAPI application. Serves the API and the static frontend from a single process on port
8000.

## Stack

- Python 3.12, managed with `uv` (`pyproject.toml` plus a committed `uv.lock`)
- FastAPI with `uvicorn[standard]`
- `pytest` for tests, `httpx2` for the test client transport

## Layout

```
backend/
  pyproject.toml   dependencies, pytest config
  uv.lock          committed; the Docker build installs from it with --locked
  app/
    main.py        the FastAPI app, session middleware, health route, static mount
    auth.py        login, logout, me, and the require_user dependency
    board.py       read and replace the signed-in user's board
    models.py      Card, Column, BoardData, the invariants, and DEFAULT_BOARD
    db.py          SQLite access, schema, password hashing, seeding
  tests/
    conftest.py    client fixtures backed by a throwaway database
    test_health.py
    test_static.py
    test_auth.py
    test_board.py
```

## Routes

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Returns `{"status": "ok"}` |
| `POST /api/auth/login` | Validates credentials and starts a session |
| `POST /api/auth/logout` | Clears the session |
| `GET /api/auth/me` | The signed-in username, or 401 |
| `GET /api/board` | The user's board, seeded on first read |
| `PUT /api/board` | Replaces the whole board |
| `GET /` | Serves the exported Next.js site (`index.html` plus `/_next/*` assets) |

API routes are declared before the `StaticFiles` mount at `/`. Routes match in declaration
order, so the mount must stay last or it will swallow every `/api/*` request.

The mount uses `check_dir=False` so the app still imports when the frontend has not been
built. `/` then returns 404 until `npm run build` has been run, which the static tests
catch, while the API tests keep working without a Node build.

## Configuration

Read from the environment, both with defaults suited to running outside Docker:

| Variable | Default | Purpose |
| --- | --- | --- |
| `STATIC_DIR` | `frontend/out` | Directory served at `/`; the Docker image sets `/app/static` |
| `DB_PATH` | `pm.db` in the repo root | SQLite file; the Docker image sets `/data/pm.db` |
| `SECRET_KEY` | a local-only default | Signs the session cookie; set it for anything real |

`OPENROUTER_API_KEY` comes from the root `.env` via compose `env_file` and is used from
Part 8.

## Running

Inside Docker, use `scripts/start.sh` or `scripts/start.ps1`.

Natively, for a quick check without a container. The frontend must be built first,
because `/` is served from `frontend/out`:

```
cd frontend && npm ci && npm run build
cd ../backend && uv sync && uv run uvicorn app.main:app --port 8000
```

## Tests

```
cd backend
uv run pytest
```

Tests import the app as `from app.main import app`. That works because
`pythonpath = ["."]` is set in `[tool.pytest.ini_options]`; pytest would otherwise only put
`backend/tests` on `sys.path`.

## Database

One module, `db.py`, holds every query. `db_path()` reads `DB_PATH` at call time rather than
import time, so tests can point at a temp file with `monkeypatch.setenv`.

`init_db()` runs from the app's lifespan: it creates the schema if absent and seeds the MVP
user (`user` / `password`) when that username is missing, so it is safe to run repeatedly.

Passwords use `hashlib.scrypt` with a per-password random salt, stored as `salt$hex`. That
is standard library only, so there is no hashing dependency to keep current.

## The board

`models.py` holds the Pydantic models. Field names match the frontend's `BoardData`
exactly, `cardIds` included, so the JSON needs no mapping in either direction.

One `model_validator` on `BoardData` enforces the five invariants from `docs/DATABASE.md`:
`cardIds` resolve to real cards, each card sits in exactly one column, card ids match their
keys, column ids are unique, and titles are not blank. A failure surfaces as a 422 and
nothing is written. From Part 9 the same validator guards whatever the AI returns.

`PUT /api/board` replaces the whole board; there are no per-card routes, and writes are last
write wins. `save_board` is an upsert on `user_id`, so a user never has two board rows.

## Sessions

`SessionMiddleware` signs a cookie that holds only `user_id`. It is HttpOnly and
SameSite=lax. Signed is not encrypted: the payload is readable but cannot be forged.

Protect a route by depending on `require_user`, which returns the user row or raises 401.

## Conventions

- Keep all database access in `db.py`
- Type the route handlers' return values
- Follow the root `AGENTS.md` coding standards: simple, concise, no emojis
