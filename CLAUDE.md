# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Read first

`AGENTS.md` in the project root holds the business requirements, the technical decisions,
the colour palette, and the coding standards. Follow those standards: simple over clever,
no unnecessary defensive programming, concise prose, no emojis anywhere, and root-cause
diagnosis backed by evidence before any fix.

Each directory has its own `AGENTS.md` with the detail for that area, and they are kept
current. Read the one for the area you are touching before changing it:

| Document | Covers |
| --- | --- |
| `backend/AGENTS.md` | Routes, sessions, board invariants, the AI client and its failure modes |
| `frontend/AGENTS.md` | Components, state ownership, selectors, test traps |
| `scripts/AGENTS.md` | The start and stop scripts |
| `docs/PLAN.md` | Part-by-part build history and the measurements behind each decision |
| `docs/DATABASE.md` | Schema, board JSON, invariants, board API contract |
| `docs/code_review.md` | The Part 11 review, what was fixed, and what is deliberately not a fault |

## Commands

Run the app (Docker, requires `.env` with `OPENROUTER_API_KEY` in the project root):

```
powershell ./scripts/start.ps1   # Windows; start.sh on Mac and Linux
powershell ./scripts/stop.ps1    # keeps the pm-data volume
docker compose down -v           # resets the database, seeded user, and demo board
```

Then http://localhost:8000, signing in with `user` / `password`.

Backend:

```
cd backend
uv sync
uv run pytest                          # offline; live tests are deselected via addopts
uv run pytest tests/test_chat.py       # one file
uv run pytest -k test_name             # one test
uv run pytest -m live                  # real OpenRouter calls, needs OPENROUTER_API_KEY
uv run ruff check .                    # lint; CI runs this too
uv run uvicorn app.main:app --port 8000
```

Frontend:

```
cd frontend
npm ci
npm run build            # static export to frontend/out; required before e2e and before / serves anything
npm run lint
npm run test:unit        # Vitest
npm run test:unit -- src/lib/kanban.test.ts    # one file
npm run test:e2e         # Playwright; includes live AI specs, so it is slow
npx playwright test tests/kanban.spec.ts       # one spec
npm run test:all
```

Running natively means building the frontend first, because FastAPI serves `/` from
`frontend/out`. Playwright reuses a running Docker container and otherwise starts uvicorn
itself.

## Architecture

One FastAPI process on port 8000 serves both the API and the statically exported Next.js
site, backed by SQLite. There is no Next server at runtime.

**The single mount ordering rule.** `app/main.py` declares every API route, then mounts
`StaticFiles` at `/` last. Routes match in declaration order, so anything added after the
mount is unreachable. The mount uses `check_dir=False` so the app imports without a Node
build; `/` 404s until `npm run build` has run.

**One board shape, end to end.** `BoardData` is `{columns: Column[], cards: Record<id,
Card>}` — cards in a flat map, order held in each column's `cardIds`. The same shape lives
in `frontend/src/lib/kanban.ts`, `backend/app/models.py`, and the `boards.data` JSON
column, with identical field names, so nothing maps between layers. Change one and you must
change the others. The seed lives in `DEFAULT_BOARD` in `models.py`; the frontend's
`initialData` survives only as a test fixture.

**One validator guards every write.** A `model_validator` on `BoardData` enforces the five
invariants from `docs/DATABASE.md`. It gates `PUT /api/board` (422) and whatever the AI
returns from `POST /api/chat` (502). Nothing is written when it fails.

**Whole-board writes only.** There are no per-card routes. `PUT /api/board` replaces the
document, last write wins; `save_board` upserts on `user_id`. On the client, every mutation
goes through `KanbanBoard.applyChange`, which sets state then PUTs. Column rename passes
`debounced: true` (500ms) so typing does not fire a request per keystroke.

A waiting rename holds a snapshot of the board as it was, so it must never outlive a newer
one: an immediate save cancels it, unmount flushes it, and a board from the AI drops it.
Left armed it silently overwrites the newer change on the server while local state keeps it,
so nothing looks wrong until reload.

**The chat exception.** When `POST /api/chat` returns a board, the route has already saved
it, so `KanbanBoard` adopts it through `adoptBoardFromAi` and deliberately does not save.
Cards travel to and from the model as an array, not the id-keyed map, because a JSON Schema
cannot require a map key to equal its card's id; `to_model_shape` and `to_stored_shape`
convert. `to_stored_shape` also refuses what the validator cannot see, because it happens
first: a `board` that is not an object, and two cards sharing an id.

**The model is not dependable, and the code is built around that.** `ai.py` excludes two
OpenRouter providers by name, `chat.py` retries `ATTEMPTS` times because gpt-oss sometimes
leaves its answer in the reasoning channel with no content, and the system prompt states
that claiming a change while `board` is null leaves the board untouched. Each of these has
measurements behind it in the Part 9 notes in `docs/PLAN.md`. Change them only against
fresh evidence, and re-run `uv run pytest -m live` several times: one green run proves
little here.

**State ownership on the client.** `App` owns the session and renders loading, the login
form, or the board. `KanbanBoard` owns all board state and every mutation handler;
everything else is presentational and takes callbacks. `ChatSidebar` owns the conversation
and is overlaid on the board, starting closed — that is a measured layout decision, not a
default worth flipping (see `frontend/AGENTS.md`).

**Configuration.** `STATIC_DIR`, `DB_PATH`, and `SECRET_KEY` are read from the environment
at call time, with defaults for running outside Docker; the image sets the first two.
`OPENROUTER_API_KEY` reaches the container from the root `.env` through compose `env_file`
and is read at call time, so the app boots and offline tests pass without it.

## Conventions

- All SQLite access lives in `db.py`. Type route handler return values.
- Frontend components are arrow functions with named exports (App Router files aside), props
  typed as a local `{Component}Props` alias. Keep new state in `KanbanBoard`.
- Use the palette CSS custom properties from `globals.css` through Tailwind arbitrary values,
  never hardcoded hex.
- The test ids listed in `frontend/AGENTS.md` are relied on by both suites. Do not rename
  them casually.
