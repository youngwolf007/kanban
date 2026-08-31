# Backend

FastAPI application. Serves the API and the static frontend from a single process on port
8000.

## Stack

- Python 3.12, managed with `uv` (`pyproject.toml` plus a committed `uv.lock`)
- FastAPI with `uvicorn[standard]`
- `pytest` for tests, `httpx2` for the test client transport
- `ruff` for linting, configured in `pyproject.toml`

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
    ai.py          the OpenRouter client
    chat.py        the AI chat route and its structured board contract
  tests/
    conftest.py    client fixtures backed by a throwaway database
    test_health.py
    test_static.py
    test_auth.py
    test_board.py
    test_ai.py
    test_chat.py
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
| `POST /api/chat` | Asks the AI about the board, and applies any change it returns |
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
| `SECRET_KEY` | a local-only default | Signs the session cookie |

The `SECRET_KEY` default is published in the source, so anything built from this repository
would otherwise sign cookies with a key anyone could read and forge. The start scripts
generate a real one into `.env` on first run and compose passes it through `env_file`. The
default remains for tests and native runs.

`OPENROUTER_API_KEY` comes from the root `.env` via compose `env_file`. It is read at call
time by `ai.py`, so the app boots and the tests run without it; only a route that actually
calls the AI needs one.

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
uv run ruff check .
```

That is offline and free: the `live` tests are deselected by default through `addopts`. To
run the real OpenRouter calls, put the key in the environment and opt in:

```
export OPENROUTER_API_KEY=$(grep '^OPENROUTER_API_KEY=' ../.env | cut -d= -f2-)
uv run pytest -m live
```

The image installs with `--no-dev` and ships no tests, so the in-container check calls the
module directly instead:

```
docker compose exec app uv run --no-dev python -c "from app.ai import ask; print(ask([{'role':'user','content':'What is 2+2?'}]))"
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
is standard library only, so there is no hashing dependency to keep current. A stored value
without the separator fails verification rather than raising, and login hashes against
`UNUSABLE_HASH` when the username is unknown, so its response time does not say whether an
account exists.

## The board

`models.py` holds the Pydantic models. Field names match the frontend's `BoardData`
exactly, `cardIds` included, so the JSON needs no mapping in either direction.

One `model_validator` on `BoardData` enforces the five invariants from `docs/DATABASE.md`:
`cardIds` resolve to real cards, each card sits in exactly one column, card ids match their
keys, column ids are unique, and titles are not blank. A failure surfaces as a 422 and
nothing is written. The same validator guards whatever the AI returns.

`PUT /api/board` replaces the whole board; there are no per-card routes, and writes are last
write wins. `save_board` is an upsert on `user_id`, so a user never has two board rows.

The model also caps the board's size: `MAX_COLUMNS`, `MAX_CARDS`, `MAX_TITLE_LENGTH` and
`MAX_DETAILS_LENGTH`. The whole board goes into the AI prompt on every chat turn, so its
size is an upstream cost, not only a storage question.

## The AI client

`ai.py` wraps the `openai` SDK pointed at OpenRouter's OpenAI-compatible endpoint, using
`openai/gpt-oss-120b` with a 30 second timeout. `ask(messages, response_format=None)`
returns the reply text; `response_format` carries the Structured Outputs schema.

Everything that can fail becomes an `AIError` with a message safe to show a user: a missing
key, an upstream error, a timeout, or a response carrying no choices at all. Nothing reaches
a caller as a stack trace.

The client is synchronous, like every route handler here. FastAPI runs a sync handler in a
threadpool, so a slow AI call does not block the event loop.

## The chat route

`POST /api/chat` takes `{message, history}` and returns `{reply, board}`. `board` is null
unless the AI changed it, so the client knows whether to re-render. History is capped at
`MAX_HISTORY` messages to keep the prompt bounded.

`message` and each history entry are capped at `MAX_MESSAGE_LENGTH`, so an oversized request
is refused with 422 before it costs anything upstream.

Cards travel to and from the model as an **array**, never as the stored id-keyed map: a JSON
Schema cannot require that a map's key equals its own card's id, and the model keyed them
arbitrarily when asked. `to_model_shape` and `to_stored_shape` convert between the two.

Anything the model returns is validated by `BoardData`, the same model that guards
`PUT /api/board`. A board that breaks an invariant is refused and nothing is written.
`to_stored_shape` rejects the two things `BoardData` cannot judge for itself, because they
happen before it sees anything: a `board` that is not an object, and two cards sharing an
id, which would otherwise collapse into one and leave a valid board quietly missing a card.

| Status | Meaning |
| --- | --- |
| 200 | A reply, plus a board when the AI changed one |
| 401 | Not signed in |
| 502 | The AI's answer was unusable or its board was invalid — including an empty board (no columns, no cards), which is treated as a dropped answer, not a request to clear the board. Nothing was written |
| 503 | OpenRouter could not be reached |

The model is not dependable on its own, and the route is built around that:

- Two providers are excluded in `ai.py`. DeepInfra ignores `response_format` and replies in
  prose; SiliconFlow always returns `board: null`, silently dropping the change.
- `gpt-oss` sometimes returns no content at all, leaving its answer in the `reasoning`
  field. `ATTEMPTS` in `chat.py` retries, and OpenRouter routes each attempt afresh. An
  `AIError` is retried in the same loop, for the same reason: a provider that timed out is
  usually fixed by landing on another one. The worst case is `ATTEMPTS` times the timeout.
- The system prompt says plainly that claiming a change while `board` is null leaves the
  board untouched. Without that the model regularly said it had done something it had not.

Each of these is backed by a measurement, not a guess. Change any of them only against
fresh evidence, and rerun `uv run pytest -m live` several times: one green run proves very
little here.

## Sessions

`SessionMiddleware` signs a cookie that holds only `user_id`. It is HttpOnly and
SameSite=lax. Signed is not encrypted: the payload is readable but cannot be forged.

Protect a route by depending on `require_user`, which returns the user row or raises 401.

## Conventions

- Keep all database access in `db.py`
- Type the route handlers' return values
- Follow the root `AGENTS.md` coding standards: simple, concise, no emojis
