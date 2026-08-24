# Project Plan

Implementation plan for the Project Management MVP. Each part below lists its goal, a
checklist of substeps, the tests to write, and the success criteria that must hold before
the part is considered done.

Read `AGENTS.md` in the project root first. It holds the business requirements, technical
decisions, colour scheme, and coding standards that govern every part of this plan.

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

### Environment verified before planning

- Docker CLI 29.7.2, Compose v5.4.0, buildx v0.36.1 are installed, and the engine runs on
  the WSL2 backend. Docker Desktop must be running before the container can be built.
- `.env` exists in the project root with a live `OPENROUTER_API_KEY` (auth check returned
  HTTP 200). It is gitignored.
- `openai/gpt-oss-120b` on OpenRouter reports support for `structured_outputs`,
  `response_format`, and `tools`. Support varies by routed provider, so Part 9 must confirm
  the actual endpoint honours strict schemas.

## Conventions

- Backend lives in `backend/`, managed with `uv` and a `pyproject.toml`.
- Backend tests use `pytest` with FastAPI's `TestClient`.
- Frontend unit tests use Vitest and Testing Library. End-to-end tests use Playwright.
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
      `pytest` and `httpx`
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

All verified in the running container: image builds to 362MB, `/` serves the placeholder
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

- [ ] Add a `users` table with `id`, `username`, `password_hash`, `created_at`
- [ ] Create the database and seed the `user` account on startup if it does not exist
- [ ] Hash the seeded password rather than storing plaintext
- [ ] Add `SessionMiddleware` with a `SECRET_KEY` read from the environment
- [ ] `POST /api/auth/login` validates credentials, sets the HttpOnly session cookie, returns the username
- [ ] `POST /api/auth/logout` clears the session
- [ ] `GET /api/auth/me` returns the username, or 401 when signed out
- [ ] Add a `require_user` FastAPI dependency for protecting later routes
- [ ] Build the login form component using the project palette
- [ ] On load, the client calls `/api/auth/me` and shows either the login form or the board
- [ ] Add a sign out control to the board header

Tests:
- [ ] Backend: login with correct credentials returns 200 and sets a cookie
- [ ] Backend: login with wrong credentials returns 401 and sets no cookie
- [ ] Backend: `/api/auth/me` returns 401 when signed out, 200 when signed in
- [ ] Backend: logout clears the session, and `/api/auth/me` then returns 401
- [ ] Backend: the session cookie is marked HttpOnly
- [ ] Vitest: the login form renders, submits, and shows an error on rejected credentials
- [ ] Vitest: the board renders instead of the login form when the session check succeeds
- [ ] Playwright: visiting `/` shows the login form, not the board
- [ ] Playwright: signing in reveals the board; signing out returns to the login form
- [ ] Playwright: reloading after sign in keeps the user signed in

Success criteria:
- A signed-out visitor to `/` cannot see the board.
- `user` / `password` signs in; any other credentials are rejected with a visible message.
- The session survives a page reload and is cleared by signing out.
- All backend, unit, and end-to-end tests pass.

---

## Part 5: Database modeling

Goal: an agreed, documented schema, with the board stored as JSON. Documentation and sign
off only; no implementation in this part.

- [ ] Write `docs/DATABASE.md` covering the schema, the JSON board shape, and the rationale
- [ ] Define the `boards` table: `id`, `user_id` (unique for the MVP), `data` (JSON text), `updated_at`
- [ ] Document the board JSON shape, matching the existing `BoardData` type in the frontend
- [ ] Specify that cards carry `id`, `title`, and `details`, and that all three are editable
- [ ] Define the API contract: `GET /api/board` and `PUT /api/board` (whole-board replace)
- [ ] Document the card edit contract, which Part 7 implements in the UI
- [ ] Document the last-write-wins trade-off of whole-board replacement
- [ ] Document how the default board is seeded for a new user
- [ ] Document where the database file lives and how the Docker volume persists it
- [ ] Get explicit user sign off on `docs/DATABASE.md` before Part 6

Tests: none (documentation only).

Success criteria:
- `docs/DATABASE.md` exists and covers schema, JSON shape, API contract, and seeding.
- The user has signed off on the schema.

---

## Part 6: Backend

Goal: API routes that read and change the signed-in user's board, backed by SQLite.

- [ ] Create the `boards` table on startup if it does not exist
- [ ] Seed a default board for a user who has none, using the existing demo data
- [ ] Define Pydantic models for `Card`, `Column`, and `BoardData`
- [ ] `GET /api/board` returns the signed-in user's board
- [ ] `PUT /api/board` validates and replaces the board, updating `updated_at`
- [ ] Reject a board whose `cardIds` reference cards that do not exist
- [ ] Protect both routes with the `require_user` dependency
- [ ] Keep all database access in one module

Tests:
- [ ] `GET /api/board` returns 401 when signed out
- [ ] `GET /api/board` seeds and returns the default board on first call
- [ ] `PUT /api/board` persists a change that a following `GET` returns
- [ ] `PUT /api/board` returns 422 for a malformed body
- [ ] `PUT /api/board` returns 422 when a `cardIds` entry has no matching card
- [ ] Two users each get their own board and cannot read each other's
- [ ] The database file is created when it does not already exist
- [ ] Data survives an application restart

Success criteria:
- Every backend test passes.
- Deleting the database file and restarting recreates it with the seeded user and board.
- Board changes persist across a container restart.

---

## Part 7: Frontend + Backend

Goal: the board is genuinely persistent, driven by the API rather than local state. Card
editing is implemented here.

- [ ] Add a small API client module in `frontend/src/lib/`
- [ ] Load the board from `GET /api/board` on sign in, replacing `initialData` as the source of truth
- [ ] Show a loading state while the board is being fetched
- [ ] Persist changes with `PUT /api/board` after move, rename, add, and delete
- [ ] Debounce column rename so typing does not fire a request per keystroke
- [ ] Add card editing to the UI: edit a card's title and details in place
- [ ] Surface a visible error if a save fails
- [ ] Keep `initialData` only as the backend's seed, not as frontend state

Tests:
- [ ] Vitest: the board renders from a mocked API response
- [ ] Vitest: moving, renaming, adding, deleting, and editing each trigger a save
- [ ] Vitest: column rename is debounced into a single save
- [ ] Vitest: a failed save surfaces an error to the user
- [ ] Vitest: card edit updates title and details
- [ ] Playwright: add a card, reload, and the card is still there
- [ ] Playwright: edit a card, reload, and the edit persisted
- [ ] Playwright: drag a card to another column, reload, and it stayed
- [ ] Playwright: rename a column, reload, and the name persisted
- [ ] Playwright: sign out and back in, and the board is unchanged

Success criteria:
- Every board change survives a page reload and a container restart.
- Cards can be edited, not only added and deleted.
- The full frontend and backend suites pass.

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
