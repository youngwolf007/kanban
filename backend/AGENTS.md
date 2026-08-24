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
    main.py        the FastAPI app, health route, static mount
  tests/
    test_health.py
    test_static.py
```

## Routes

| Route | Purpose |
| --- | --- |
| `GET /api/health` | Returns `{"status": "ok"}` |
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
| `DB_PATH` | `/data/pm.db` in Docker | SQLite file location, used from Part 4 |

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

## Conventions

- Keep all database access in one module once Part 6 introduces it
- Type the route handlers' return values
- Follow the root `AGENTS.md` coding standards: simple, concise, no emojis
