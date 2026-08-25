# Project Plan

Implementation plan for the Project Management MVP. Each part below lists its goal, a
checklist of substeps, the tests to write, and the success criteria that must hold before
the part is considered done.

Read `AGENTS.md` in the project root first. It holds the business requirements, technical
decisions, colour scheme, and coding standards that govern every part of this plan.

Companion documents:

| Document | Covers |
| --- | --- |
| `docs/DATABASE.md` | Schema, board JSON, invariants, and the board API contract (Part 5) |
| `backend/AGENTS.md` | Backend layout, routes, configuration, sessions |
| `frontend/AGENTS.md` | Frontend layout, state, selectors, test gotchas |

## Architecture

Single Docker container. A FastAPI process serves both the API and the statically exported
Next.js site.

```
Browser
  |
  v
FastAPI (uvicorn, port 8000)
  |-- /            static Next.js export (frontend/out), html=True
  |-- /api/auth/*  login, logout, session check
  |-- /api/board   read and replace the signed-in user's board
  |-- /api/chat    AI chat via OpenRouter
  |
  v
SQLite (/data/pm.db, created on first run)
```

The image is built in two stages: a Node stage runs `next build` to produce the static
export, and a Python stage installs backend dependencies with `uv` and copies the built
site in alongside the backend source.

## Decisions

These were agreed before planning and are settled. Do not revisit them without asking.

| Topic | Decision |
| --- | --- |
| App port | 8000, both in the container and on the host |
| Frontend build | Next.js static export (`output: "export"`); no Next server at runtime |
| Routing | Single route at `/`. Login and board are rendered from client state, not separate pages |
| Database | SQLite. The board is stored as a single JSON blob column, not normalized tables |
| Auth | HttpOnly signed session cookie issued by FastAPI |
| Card editing | Scoped in Part 5 (schema and API contract), implemented in the UI in Part 7 |
| AI model | `openai/gpt-oss-120b` via OpenRouter |

### Implementation decisions

Made while building, not agreed in advance. Each one is a judgement call that a reader of
this plan would otherwise have to reverse engineer from the code.

| Part | Decision | Why |
| --- | --- | --- |
| 2 | Dev dependency is `httpx2`, not `httpx` | Starlette 1.6 deprecates `httpx` for its test client and warns on every run |
| 2 | Dockerfile had no placeholder Node stage | A build stage that builds nothing is waste; the stage arrived in Part 3 where it does work |
| 2 | `scripts/stop.*` runs `docker compose down`, keeping the volume | Stopping the app must not destroy the database. `down -v` is the documented way to reset |
| 3 | `StaticFiles(..., check_dir=False)` | Without it a missing `frontend/out` raises at import and every backend test fails confusingly. Now `/` simply 404s until the frontend is built, which the static test catches |
| 3 | `frontend/out` is in `.dockerignore` | The Node stage always builds fresh; a local build must never leak into the image |
| 3 | Playwright targets the FastAPI build with `reuseExistingServer` | Tests then exercise what ships, and reuse the running container when there is one |
| 4 | `hashlib.scrypt` rather than bcrypt or passlib | A real KDF with a per-password salt, from the standard library, so there is no hashing dependency to keep current |
| 4 | `SECRET_KEY` falls back to a local-only default | The root `.env` holds only `OPENROUTER_API_KEY`, so without a fallback the container would not boot |
| 4 | Session cookie is signed, not encrypted | `SessionMiddleware` signs with `itsdangerous`. It carries only `user_id`, so the payload is readable but cannot be forged |
| 4 | `/api/auth/me` answers 401 when signed out | Matches the plan. Chrome logs the expected 401 as a failed resource, so the console-error spec filters that one URL |
| 4 | `db_path()` reads `DB_PATH` at call time | Lets tests point at a temp database with `monkeypatch.setenv`; reading it at import would freeze the path |
| 5 | Whole-board `PUT`, last write wins | See `docs/DATABASE.md`. One replace route serves the frontend, card editing, and the AI alike |
| 7 | `KanbanBoard` fetches its own board | Keeps `App` about the session only, and all board state in one component |
| 7 | Only column rename is debounced, at 500ms | It is the one handler that fires per keystroke; moves, adds, deletes, and edits save at once |
| 7 | Drag is disabled while a card is being edited | Otherwise typing inside the card can start a drag |
| 7 | Playwright runs with `workers: 1` | Every spec drives the same user and the same stored board, so parallel runs overwrite each other |
| 7 | `initialData` kept as a test fixture only | The backend owns the seed; the constant is tree shaken out of the bundle |

### Known gotchas

Each of these was hit in practice and cost a test run.

- `@dnd-kit` gives every card article `role="button"` for keyboard sorting, and its
  accessible name absorbs the nested Remove button's label. Scope delete lookups to the
  card's testid or a role query matches two elements.
- Next renders its own `role="alert"` route announcer, so `getByRole("alert")` is ambiguous
  in Playwright. The login error carries a `login-error` testid for this reason.
- A `Response` body can only be read once. `mockResolvedValue(new Response(...))` hands the
  same object to every call, so the second read throws. Build a fresh response per call with
  `mockImplementation`.
- In an end-to-end helper, sign in through the UI before calling the API. An API login sets
  the session cookie, the app then renders the board directly, and the UI sign in waits for
  a login form that will never appear.
- Mock `fetch` by URL, not by call order. Components fetch on mount, so any new fetch
  silently shifts every ordered mock after it.

### Environment verified before planning

- Docker CLI 29.7.2, Compose v5.4.0, buildx v0.36.1 are installed, and the engine runs on
  the WSL2 backend. Docker Desktop must be running before the container can be built.
- `.env` exists in the project root with a live `OPENROUTER_API_KEY` (auth check returned
  HTTP 200). It is gitignored.
- `openai/gpt-oss-120b` on OpenRouter reports support for `structured_outputs`,
  `response_format`, and `tools`. Support varies by routed provider, so Part 9 must confirm
  the actual endpoint honours strict schemas.

### Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `STATIC_DIR` | `frontend/out` | Directory served at `/`; the image sets `/app/static` |
| `DB_PATH` | `pm.db` in the repo root | SQLite file; the image sets `/data/pm.db` |
| `SECRET_KEY` | a local-only default | Signs the session cookie |
| `OPENROUTER_API_KEY` | none | From the root `.env`, used from Part 8 |

## Conventions

- Backend lives in `backend/`, managed with `uv` and a `pyproject.toml`.
- Backend tests use `pytest` with FastAPI's `TestClient`.
- Frontend unit tests use Vitest and Testing Library. End-to-end tests use Playwright.
- End-to-end tests share one user and one stored board. They run with `workers: 1`, and any
  spec that changes the board starts from `startFresh` in `frontend/tests/helpers.ts`.
- Build the frontend before running the backend static tests or Playwright; both check what
  is actually served.
- Every part ends with all tests green. Do not start the next part with a red suite.
- Tick each checkbox in this document as it is completed.

---

## Part 1: Plan

Goal: a detailed, approved plan and a description of the existing frontend code.

- [x] Enrich `docs/PLAN.md` with per-part substeps, tests, and success criteria
- [x] Create `frontend/AGENTS.md` describing the existing frontend code
- [x] Confirm the open technical decisions with the user and record them above
- [x] Get explicit user approval of this plan before starting Part 2

Tests: none (documentation only).

Success criteria:
- The user has read and approved this plan.
- `frontend/AGENTS.md` accurately describes the current frontend.

---

## Part 2: Scaffolding

Goal: a Docker container that runs FastAPI, serves a placeholder static page at `/`, and
answers an API call. No frontend build yet.

- [x] Create `backend/pyproject.toml` with `fastapi`, `uvicorn[standard]`, and dev deps
      `pytest` and `httpx2`
- [x] Create `backend/app/main.py` with the FastAPI app
- [x] Add `GET /api/health` returning `{"status": "ok"}`
- [x] Serve a placeholder `index.html` at `/` via `StaticFiles(html=True)`
- [x] Write the `Dockerfile` (Python runtime stage using `uv`; the Node build stage arrives in Part 3)
- [x] Write `docker-compose.yml` mapping port 8000 and mounting a volume for the database
- [x] Load `.env` from the project root into the container
- [x] Write `scripts/start.sh` and `scripts/stop.sh` for Mac and Linux
- [x] Write `scripts/start.ps1` and `scripts/stop.ps1` for Windows
- [x] Update `backend/AGENTS.md` and `scripts/AGENTS.md` to describe what now exists

Tests:
- [x] `backend/tests/test_health.py` asserts `GET /api/health` returns 200 and `{"status": "ok"}`
- [x] `backend/tests/test_static.py` asserts `GET /` returns 200 and HTML

Success criteria:
- [x] `scripts/start.sh` (or `start.ps1`) builds and starts the container with no errors.
- [x] `http://localhost:8000/` shows the placeholder page.
- [x] `http://localhost:8000/api/health` returns `{"status": "ok"}`.
- [x] `scripts/stop.sh` (or `stop.ps1`) stops and removes the container.
- [x] `pytest` passes in `backend/`.

All verified in the running container: image builds cleanly (362MB then, 364MB once
Part 3 added the frontend), `/` serves the placeholder
(HTTP 200, text/html) and its fetch of `/api/health` returns `{"status": "ok"}`, an unknown
path returns 404, uvicorn logs no errors, `OPENROUTER_API_KEY` reaches the container from
the root `.env`, `/data` is writable, and a file written there survives a full
`stop.sh` then `start.sh` cycle. Note that Docker Desktop on Windows needs the WSL2 backend;
`VirtualMachinePlatform` and `Microsoft-Windows-Subsystem-Linux` must be enabled.

---

## Part 3: Add in Frontend

Goal: the real Kanban demo, statically built and served by FastAPI at `/`.

- [x] Set `output: "export"` in `frontend/next.config.ts`
- [x] Confirm the build produces `frontend/out/index.html` and asset files
- [x] Add the Node build stage to the `Dockerfile` and copy `frontend/out` into the runtime stage
- [x] Point FastAPI's `StaticFiles` at the exported site and remove the placeholder page
- [x] Verify `next/font/google` resolves during the Docker build (it fetches fonts at build time)
- [x] Confirm the colour scheme in `globals.css` matches the palette in the root `AGENTS.md`
- [x] Repoint `frontend/playwright.config.ts` at `http://127.0.0.1:8000` against the served build
- [x] Add `frontend/test-results/` to `frontend/.gitignore` and untrack the committed file

Tests:
- [x] Existing Vitest suites still pass (`kanban.test.ts`, `KanbanBoard.test.tsx`)
- [x] Extend `kanban.test.ts` to cover no-op moves and unknown ids
- [x] Add Vitest coverage for column rename and for the add and delete card handlers
- [x] Playwright: board loads at `/`, shows five columns, adds a card, drags a card between columns
- [x] Backend test asserting `GET /` serves the exported `index.html`

Success criteria:
- [x] `http://localhost:8000/` shows the Kanban board with all five columns and seeded cards.
- [x] Drag and drop, column rename, add card, and delete card all work in the container.
- [x] `npm run test:unit` and `npm run test:e2e` both pass against the served build.
- [x] No console errors in the browser.

Verified against the running container: `/` serves the exported board (HTTP 200, 20391
bytes), CSS and self-hosted woff2 assets return 200, and `/api/health` still routes past the
static mount. Suites: backend 3 passed, Vitest 20 passed (up from 6), Playwright 7 passed
(up from 3), with the console-error check among them. The Docker Node stage runs `npm ci`
and `npm run build` inside the image, so `next/font/google` is fetched at build time and the
fonts ship self-hosted; nothing is requested from Google at runtime.

---

## Part 4: Add in a fake user sign in experience

Goal: `/` requires a sign in with `user` / `password` before the board is visible, and the
user can sign out.

- [x] Add a `users` table with `id`, `username`, `password_hash`, `created_at`
- [x] Create the database and seed the `user` account on startup if it does not exist
- [x] Hash the seeded password rather than storing plaintext
- [x] Add `SessionMiddleware` with a `SECRET_KEY` read from the environment
- [x] `POST /api/auth/login` validates credentials, sets the HttpOnly session cookie, returns the username
- [x] `POST /api/auth/logout` clears the session
- [x] `GET /api/auth/me` returns the username, or 401 when signed out
- [x] Add a `require_user` FastAPI dependency for protecting later routes
- [x] Build the login form component using the project palette
- [x] On load, the client calls `/api/auth/me` and shows either the login form or the board
- [x] Add a sign out control to the board header

Tests:
- [x] Backend: login with correct credentials returns 200 and sets a cookie
- [x] Backend: login with wrong credentials returns 401 and sets no cookie
- [x] Backend: `/api/auth/me` returns 401 when signed out, 200 when signed in
- [x] Backend: logout clears the session, and `/api/auth/me` then returns 401
- [x] Backend: the session cookie is marked HttpOnly
- [x] Vitest: the login form renders, submits, and shows an error on rejected credentials
- [x] Vitest: the board renders instead of the login form when the session check succeeds
- [x] Playwright: visiting `/` shows the login form, not the board
- [x] Playwright: signing in reveals the board; signing out returns to the login form
- [x] Playwright: reloading after sign in keeps the user signed in

Success criteria:
- [x] A signed-out visitor to `/` cannot see the board.
- [x] `user` / `password` signs in; any other credentials are rejected with a visible message.
- [x] The session survives a page reload and is cleared by signing out.
- [x] All backend, unit, and end-to-end tests pass.

Verified in the running container. Suites: backend 22 passed, Vitest 30 passed, Playwright
14 passed, eslint clean. `set-cookie` carries `httponly; samesite=lax`, and an e2e test
confirms `document.cookie` cannot see the session. The database is created in the Docker
volume at `/data/pm.db` with the seeded user's password stored as a 161-character scrypt
hash, never plaintext.

Passwords use `hashlib.scrypt` from the standard library with a per-password random salt,
so no hashing dependency was added. The session cookie is signed by `SessionMiddleware`
(via `itsdangerous`) but not encrypted; it carries only `user_id`, so its contents are
readable while remaining tamper-proof. `SECRET_KEY` comes from the environment and falls
back to a documented local-only default.

---

## Part 5: Database modeling

Goal: an agreed, documented schema, with the board stored as JSON. Documentation and sign
off only; no implementation in this part.

- [x] Write `docs/DATABASE.md` covering the schema, the JSON board shape, and the rationale
- [x] Define the `boards` table: `id`, `user_id` (unique for the MVP), `data` (JSON text), `updated_at`
- [x] Document the board JSON shape, matching the existing `BoardData` type in the frontend
- [x] Specify that cards carry `id`, `title`, and `details`, and that all three are editable
- [x] Define the API contract: `GET /api/board` and `PUT /api/board` (whole-board replace)
- [x] Document the card edit contract, which Part 7 implements in the UI
- [x] Document the last-write-wins trade-off of whole-board replacement
- [x] Document how the default board is seeded for a new user
- [x] Document where the database file lives and how the Docker volume persists it
- [x] Get explicit user sign off on `docs/DATABASE.md` before Part 6

Tests: none (documentation only).

Success criteria:
- [x] `docs/DATABASE.md` exists and covers schema, JSON shape, API contract, and seeding.
- [x] The user has signed off on the schema.

Signed off. All five decisions confirmed: JSON blob over normalized tables, one board per
user, whole-board `PUT` with last write wins, card editing through that same `PUT`, and lazy
seeding on first `GET`.

---

## Part 6: Backend

Goal: API routes that read and change the signed-in user's board, backed by SQLite.

- [x] Create the `boards` table on startup if it does not exist
- [x] Seed a default board for a user who has none, using the existing demo data
- [x] Define Pydantic models for `Card`, `Column`, and `BoardData`
- [x] `GET /api/board` returns the signed-in user's board
- [x] `PUT /api/board` validates and replaces the board, updating `updated_at`
- [x] Enforce all five invariants in `docs/DATABASE.md`, not only the `cardIds` one
- [x] Protect both routes with the `require_user` dependency
- [x] Keep all database access in `db.py`

Tests:
- [x] `GET /api/board` returns 401 when signed out
- [x] `GET /api/board` seeds and returns the default board on first call
- [x] `PUT /api/board` persists a change that a following `GET` returns
- [x] `PUT /api/board` returns 422 for a malformed body
- [x] `PUT /api/board` returns 422 for each of the five invariants in `docs/DATABASE.md`
- [x] Two users each get their own board and cannot read each other's
- [x] The database file is created when it does not already exist
- [x] Data survives an application restart

Success criteria:
- [x] Every backend test passes.
- [x] Deleting the database file and restarting recreates it with the seeded user and board.
- [x] Board changes persist across a container restart.

Backend went from 22 to 52 tests, all passing; Vitest 30 and Playwright 14 stayed green.
Verified against the running container: `GET /api/board` is 401 signed out, seeds the eight
card demo board on first read, and a `PUT` carrying a card edit and a move survived a full
`stop` then `start` cycle. An invalid board is refused with 422 and the message
`cardIds reference cards that do not exist: ['ghost']`, leaving the stored board untouched.
The live `boards` table holds exactly one row per user.

The five invariants live in one `model_validator` on `BoardData` in `app/models.py`, so the
same rules guard `PUT /api/board` and, from Part 9, anything the AI returns.

---

## Part 7: Frontend + Backend

Goal: the board is genuinely persistent, driven by the API rather than local state. Card
editing is implemented here.

- [x] Add a small API client module in `frontend/src/lib/`
- [x] Load the board from `GET /api/board` on sign in, replacing `initialData` as the source of truth
- [x] Show a loading state while the board is being fetched
- [x] Persist changes with `PUT /api/board` after move, rename, add, and delete
- [x] Debounce column rename so typing does not fire a request per keystroke
- [x] Add card editing to the UI: edit a card's title and details in place
- [x] Surface a visible error if a save fails
- [x] Keep `initialData` only as the backend's seed, not as frontend state

Tests:
- [x] Vitest: the board renders from a mocked API response
- [x] Vitest: moving, renaming, adding, deleting, and editing each trigger a save
- [x] Vitest: column rename is debounced into a single save
- [x] Vitest: a failed save surfaces an error to the user
- [x] Vitest: card edit updates title and details
- [x] Playwright: add a card, reload, and the card is still there
- [x] Playwright: edit a card, reload, and the edit persisted
- [x] Playwright: drag a card to another column, reload, and it stayed
- [x] Playwright: rename a column, reload, and the name persisted
- [x] Playwright: sign out and back in, and the board is unchanged

Success criteria:
- [x] Every board change survives a page reload and a container restart.
- [x] Cards can be edited, not only added and deleted.
- [x] The full frontend and backend suites pass.

Backend 52, Vitest 38 (up from 30), Playwright 21 (up from 14), eslint clean. The demo card
text no longer appears anywhere in the shipped bundle, so the board provably comes from the
API rather than from `initialData`.

Two things this part forced. Board changes now persist, so end-to-end tests stopped being
isolated: Playwright runs with `workers: 1` and `startFresh` resets the board between tests,
because every spec drives the same user and the same stored board. And ordering matters in
that helper. Signing in through the API first sets the cookie, the app then renders the
board directly, and the UI sign in has no form left to fill.

---

## Part 8: AI connectivity

Goal: prove the backend can reach OpenRouter and get a correct answer back.

- [ ] Read `OPENROUTER_API_KEY` from the environment and fail clearly at startup if it is missing
- [ ] Add an OpenRouter client module using `openai/gpt-oss-120b`
- [ ] Confirm the key reaches the container from the root `.env`
- [ ] Run a live "what is 2+2" call and confirm the answer
- [ ] Record which provider the request routed to and whether it honours strict schemas,
      to settle the Part 9 approach
- [ ] Handle a failed or timed out AI call without crashing the request

Tests:
- [ ] A live connectivity test, marked so it can be skipped without a key, asserting the
      "2+2" answer contains 4
- [ ] A unit test with the OpenRouter call mocked, asserting the request is well formed
- [ ] A unit test asserting an upstream failure returns a clean error, not a stack trace

Success criteria:
- The live "2+2" test passes from inside the container.
- The mocked tests pass without a network connection.
- The chosen structured-output approach for Part 9 is decided and recorded here.

---

## Part 9: AI board updates

Goal: the AI always receives the board JSON plus the user's question and conversation
history, and replies with Structured Outputs carrying a reply and an optional board update.

- [ ] Define the structured response schema: `reply` (string) and `board` (full board or null)
- [ ] Build the prompt from the current board JSON, the conversation history, and the question
- [ ] Instruct the model to return a board only when the user asked for a change
- [ ] Send the schema using the approach confirmed in Part 8
- [ ] `POST /api/chat` accepts a message and history, protected by `require_user`
- [ ] Validate any returned board with the same Pydantic models used by `PUT /api/board`
- [ ] Persist a returned board and tell the client the board changed
- [ ] Reject an invalid board from the model without persisting it
- [ ] Cap conversation history to keep the prompt bounded

Tests:
- [ ] Mocked: a question with no board change returns a reply and leaves the board unchanged
- [ ] Mocked: a create-card response persists the new card
- [ ] Mocked: a move-card response persists the move
- [ ] Mocked: an invalid board from the model is rejected and nothing is persisted
- [ ] Mocked: conversation history is included in the request
- [ ] `POST /api/chat` returns 401 when signed out
- [ ] Live: asking the AI to add a card actually adds it

Success criteria:
- The AI can create, edit, and move cards through chat, and the changes persist.
- A malformed model response never corrupts the stored board.
- Mocked tests pass with no network. The live test passes in the container.

---

## Part 10: AI chat sidebar

Goal: a chat sidebar in the UI that drives the board through the AI, refreshing the board
automatically when the AI changes it.

- [ ] Build the sidebar chat component using the project palette
- [ ] Lay out the board and sidebar so the board stays usable alongside the chat
- [ ] Render the message history with distinct user and assistant styling
- [ ] Show a pending state while the AI is responding
- [ ] Send the message and history to `POST /api/chat`
- [ ] Refresh the board automatically when the response carries a board update
- [ ] Show a clear error if the chat request fails
- [ ] Allow the sidebar to be collapsed and reopened
- [ ] Keep the layout usable at narrow widths

Tests:
- [ ] Vitest: the sidebar renders, sends a message, and displays the reply
- [ ] Vitest: a response with a board update refreshes the displayed board
- [ ] Vitest: a response with no board update leaves the board untouched
- [ ] Vitest: the pending state shows while a request is in flight and clears afterwards
- [ ] Vitest: a failed request shows an error
- [ ] Vitest: the sidebar collapses and reopens
- [ ] Playwright: ask the AI to add a card, and it appears on the board without a manual reload
- [ ] Playwright: the added card is still there after a reload
- [ ] Playwright: a plain question gets a reply and leaves the board unchanged

Success criteria:
- A user can hold a conversation in the sidebar and see the board update itself.
- The board never needs a manual refresh after an AI change.
- The whole suite passes: backend `pytest`, frontend `npm run test:unit`, and `npm run test:e2e`.
- The finished app builds and runs from `scripts/start.sh` or `scripts/start.ps1` alone.
