# Project Management MVP

A single-board Kanban app with an AI assistant. Sign in, drag cards between columns, edit
them, or ask the assistant in the sidebar to do it for you.

Runs as one Docker container: FastAPI serves the API and the statically exported Next.js
site on port 8000, backed by SQLite.

## Requirements

- Docker Desktop, running
- A `.env` in the project root containing `OPENROUTER_API_KEY`

## Run

```
./scripts/start.sh               # Mac, Linux
powershell ./scripts/start.ps1   # Windows
```

Open http://localhost:8000 and sign in with `user` / `password`.

```
./scripts/stop.sh                # Mac, Linux
powershell ./scripts/stop.ps1    # Windows
```

`stop` keeps the database volume. To reset the database, seeded user, and demo board, run
`docker compose down -v`.

## Tests

```
cd backend && uv run pytest              # 96 tests, no network needed
cd backend && uv run pytest -m live      # calls OpenRouter for real

cd frontend && npm run test:unit         # Vitest
cd frontend && npm run build             # Playwright tests what is served
cd frontend && npm run test:e2e          # includes live AI specs, so it is slow
```

## Layout

```
backend/     FastAPI app, SQLite access, the OpenRouter client and chat route
frontend/    Next.js app, exported statically and served at /
scripts/     start and stop, per platform
docs/        the database design
```

## Documentation

| Document | Covers |
| --- | --- |
| `AGENTS.md` | Requirements, technical decisions, palette, coding standards |
| `docs/DATABASE.md` | Schema, board JSON, invariants, and the board API contract |
| `backend/AGENTS.md` | Backend layout, routes, sessions, and the AI's failure modes |
| `frontend/AGENTS.md` | Frontend layout, state, selectors, and test gotchas |
