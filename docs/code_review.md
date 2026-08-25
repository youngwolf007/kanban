# Code Review

A full review of the repository at commit `7b9a2b3` (branch `part10`), covering the backend, the
frontend, the container setup, the scripts, and repository hygiene.

The findings below are kept as written, in the present tense of the review. What was done
about each is in [Actions, in order](#actions-in-order) at the end.

## Verdict

The codebase is in good shape for an MVP. The architecture holds together, the board shape is
genuinely shared end to end, and the documentation is unusually accurate: almost every design
decision in `docs/PLAN.md` is backed by a measurement rather than an assertion. The full suite
passes, both natively and against the container.

The findings below are, with one exception, robustness gaps rather than design mistakes. The
exception is H1, which loses a user's data silently and is reachable by ordinary use.

Nothing here contradicts a decision recorded in `docs/PLAN.md`. Where a finding touches a
recorded decision, that is noted.

## How this review was done

Every source file was read: `backend/app/*.py`, `frontend/src/**`, the `Dockerfile`,
`docker-compose.yml`, both script pairs, and the ignore files. Four candidate defects were then
proved with throwaway probes rather than left as assertions. The probes were deleted after use;
their output is quoted under each finding.

Suites at the time of review, all passing: backend 81 offline plus 4 live, Vitest 53, Playwright
25 (run twice, natively and against the container), `next build` and `eslint` clean.

---

## High

### H1. A debounced rename silently discards a change made just after it

`frontend/src/components/KanbanBoard.tsx:54-84`

Column rename saves through `persistAfterTyping`, which schedules a `PUT` of the board snapshot
captured at that moment. Any other change made within the 500ms window saves immediately, but the
rename timer then fires with its **older** snapshot and overwrites the server with it. The newer
change is gone, and because `PUT` is last write wins with no merge, nothing errors.

The UI does not reveal the loss: local state still holds the newer board, so the card stays on
screen until the next reload.

Evidence. A probe rendered the board, renamed a column, added a card before the timer fired, then
waited for it:

```
LAST SAVED column title: Renamed
LAST SAVED contains 'Buy milk': false
LAST SAVED card count: 8
```

The column on screen read "3 cards"; the board on the server had 8 cards and no "Buy milk".

The existing test (`KanbanBoard.test.tsx:211`) renames in isolation, so the window is never
opened. The same loss applies to a drag, a delete, or an edit made in that window, and to an AI
change arriving from `POST /api/chat` while a rename is pending.

A second, milder case sits in the same mechanism: the unmount cleanup at `KanbanBoard.tsx:45-52`
drops a pending rename rather than flushing it, so renaming a column and immediately signing out
loses the rename.

**Action.** Cancel any pending rename timer whenever a non-debounced change is applied. The new
snapshot already contains the rename, because it derives from current state, so cancelling loses
nothing. Flush rather than drop on unmount. Add a regression test for the interleaving above.

### H2. A non-object `board` from the model returns 500, not the documented 502

`backend/app/chat.py:126-131` and `backend/app/chat.py:177-182`

`to_stored_shape` calls `board.get(...)` on whatever the model put in the `board` key. The call
site catches `ValidationError`, `KeyError` and `TypeError`, but a string or an array raises
`AttributeError`, which is not in that tuple and escapes as an unhandled 500.

Evidence. Two probes, one returning `"board": "the board"` and one returning `"board": [1,2,3]`:

```
AttributeError: 'list' object has no attribute 'get'
app\chat.py:129: AttributeError
```

This matters because the module is otherwise built on the premise that the model's output cannot
be trusted, and says so at `chat.py:149-151`. The contract documented in `backend/AGENTS.md` is
502 for an unusable answer.

**Action.** Reject a `board` that is not a dict before shaping it, with the same 502 as any other
unusable answer.

### H3. Duplicate card ids from the model silently overwrite an existing card

`backend/app/chat.py:130`

`{card["id"]: card for card in board.get("cards", [])}` collapses duplicates: the last card wins.
The collapse happens *before* `BoardData` validates, so the invariants cannot catch it. The result
is a structurally valid board in which an existing card has been replaced by a different one.

Evidence. A probe returned the current board plus one extra card reusing `card-1`'s id:

```
DUPLICATE IDS -> 200 | card-1 title now: Impostor
```

HTTP 200, change persisted, the original "Align roadmap themes" gone. The model is explicitly told
at `chat.py:92` to give a new card an unused id, which is exactly the kind of instruction the Part
9 notes show it follows unreliably.

**Action.** Detect a repeated id while building the map and refuse the board with 502.

### H4. An empty `choices` list from a provider returns 500

`backend/app/ai.py:57`

`completion.choices[0]` assumes at least one choice. `ai.py` converts every other upstream failure
into an `AIError` carrying a message safe to show a user; this one raises `IndexError` straight
through both the 503 and 502 handlers in `chat.py`.

Evidence:

```
RAISED: IndexError - list index out of range
```

Given the provider variability documented in the Part 9 notes, an empty `choices` is plausible
rather than theoretical.

**Action.** Raise `AIError` when `choices` is empty, so it joins the existing 503 path.

---

## Medium

### M1. The shipped container signs sessions with the public default key

`backend/app/main.py:16`, `docker-compose.yml`

`SECRET_KEY` falls back to `dev-secret-key-for-local-use-only`, and compose never sets it, so every
container built from this repository signs its session cookies with a key published in the source.
Anyone who has read the repo can forge a cookie for any `user_id` and obtain a signed-in session
without credentials.

This is a knock-on of a recorded decision (Part 4: the fallback exists because the root `.env`
holds only `OPENROUTER_API_KEY`, and without it the container would not boot). The decision is
sound; the gap is that nothing then generates a real key for the container.

For an MVP bound to localhost this is acceptable and need not block anything. It is recorded here
because it is the one item that must change before this is exposed to a network.

**Action.** Have the start scripts generate a `SECRET_KEY` into `.env` when absent and pass it
through compose. Keep the fallback for tests and native runs.

### M2. The UI accepts a column title the backend refuses

`frontend/src/components/KanbanColumn.tsx:44-49`, `backend/app/models.py:22-27`

The column title input is unconstrained, so clearing it puts the board into a state the API rejects
with 422. The user sees "Could not save your changes" and, from then on, every save of that board
fails until the title is restored. The client can enter a state it cannot leave by saving.

**Action.** Either keep the last non-blank title when the field is cleared, or validate before
calling `onRename`, so the client never holds a board the server would refuse.

### M3. A failed sign out is silent

`frontend/src/components/App.tsx:19-22`

`await logout()` throws on a non-ok response and nothing catches it. The session is not cleared, no
message is shown, and the click produces an unhandled promise rejection. The user appears to have
clicked a dead button.

**Action.** Catch, and either surface the failure or clear the local session anyway.

### M4. A transient AI failure gets no retry, while an empty answer gets three

`backend/app/chat.py:137-141`

`ATTEMPTS = 3` guards a malformed or empty answer, but an `AIError` breaks out of the loop on first
occurrence and becomes a 503. A timeout from a slow provider is precisely the case the comment at
`chat.py:19-23` describes as fixable by re-routing, since OpenRouter routes each attempt afresh.

**Action.** Retry an `AIError` inside the same loop, raising 503 only once the attempts are
exhausted. With `TIMEOUT_SECONDS = 30` this raises the worst-case wait, so keep the attempt count
in view.

### M5. Nothing bounds request or prompt size

`backend/app/chat.py:108-110`, `backend/app/board.py:27-33`

`ChatRequest.message` has no length limit, `PUT /api/board` accepts a board of any size, and the
whole board is serialised into the system prompt on every chat turn. `MAX_HISTORY` bounds the
transcript but not the board or the message. A large board makes every chat call slower and more
expensive; a large message is unbounded input to a paid API.

**Action.** Cap the message length and the stored board size, rejecting beyond them with 422.

---

## Low and hygiene

| # | Finding | Location | Action |
| --- | --- | --- | --- |
| L1 | Duplicate detection is quadratic: `placed.count(...)` runs inside a comprehension over `placed` | `backend/app/models.py:46` | Use `collections.Counter` |
| L2 | Docstring says "retried once"; `ATTEMPTS` is 3 | `backend/app/chat.py:135` | Correct the docstring |
| L3 | The `min-w-0` fix applied to `KanbanCard` is missing from the preview, which is the identical pattern | `KanbanCardPreview.tsx:10` vs `KanbanCard.tsx:100-102` | Add `min-w-0 break-words` |
| L4 | `"No details yet."` is written into stored data, and the AI never applies it, so identical empty cards render differently by origin | `KanbanBoard.tsx:129,164` | Make it a render-time fallback, not data |
| L5 | All five columns share `aria-label="Column title"` | `KanbanColumn.tsx:48` | Include the column name |
| L6 | The card article carries drag listeners and an implicit `role="button"` while containing Edit and Remove buttons | `KanbanCard.tsx:95-96` | Move the drag handle to its own element; this also removes the selector trap documented in `frontend/AGENTS.md` |
| L7 | `stored.split("$")` is unguarded, so a corrupted hash raises `ValueError` and returns 500 rather than 401 | `backend/app/db.py:57` | Return `False` on a malformed hash |
| L8 | Login does no hashing work for an unknown username, so response time reveals whether a username exists | `backend/app/auth.py:28-32` | Verify against a dummy hash on the miss path |
| L9 | `create_user` is typed to return `int`; `cursor.lastrowid` is optional | `backend/app/db.py:78-88` | Narrow or assert |
| L10 | No CI workflow, and no Python linter or formatter configured | repository root, `backend/pyproject.toml` | Add a workflow running the offline suites and eslint; add `ruff` |
| L11 | No `HEALTHCHECK` although `/api/health` exists, and the container runs as root | `Dockerfile` | Add a healthcheck and a non-root user |
| L12 | The sign-off checkboxes are unticked although `docs/PLAN.md` records the sign-off and Part 6 shipped | `docs/DATABASE.md:207-211` | Tick them, so the two documents agree |
| L13 | `npm run test` duplicates `npm run test:unit` | `frontend/package.json` | Drop one |

---

## Not faults

Recorded so a later reader does not re-open them.

- **Last write wins on `PUT /api/board`.** Accepted deliberately in `docs/DATABASE.md`, with the
  upgrade path written down. H1 is not this: it is the client discarding its own newer change,
  which the documented trade-off does not cover.
- **The chat panel overlaying the board, closed by default.** Measured, not styled. The numbers are
  in the Part 10 notes.
- **Excluding two providers by name.** Narrow, evidence-based and documented, rather than a
  whitelist that rots as OpenRouter's roster changes.
- **The board stored as one JSON document.** Correct for an app whose boards are a few kilobytes
  and which round-trips a whole board through a model.
- **`initialData` surviving in the frontend.** A test fixture, tree shaken from the bundle, with a
  Playwright test asserting the board comes from the API.

## Actions, in order

All of these are done except where noted. Each fix carries a regression test that fails
against the code as it was.

1. [x] H1: an immediate save cancels the waiting rename, unmount flushes it, and a board
   from the AI drops it, because that one is already stored. Three tests in
   `KanbanBoard.test.tsx` cover the interleaving, the unmount, and the blank title
2. [x] H3: `to_stored_shape` refuses a repeated card id with 502
3. [x] H2: `to_stored_shape` refuses a `board` that is not an object with 502
4. [x] H4: `ai.py` raises `AIError` when `choices` is empty, so it joins the 503 path
5. [x] M2: `KanbanColumn` keeps the title in a local draft and never hands a blank one to
   `onRename`, so the board keeps the last usable title and the field restores it on blur
6. [x] M3: a failed sign out clears the local session anyway and returns to the login form
7. [x] M1: the start scripts generate a `SECRET_KEY` into `.env` when there is not one, and
   compose passes it through `env_file`. The fallback stays for tests and native runs
8. [x] M4: an `AIError` is retried inside the same loop and only raises 503 once `ATTEMPTS`
   are exhausted
9. [x] M5: `MAX_MESSAGE_LENGTH` bounds the message and each history entry;
   `MAX_COLUMNS`, `MAX_CARDS`, `MAX_TITLE_LENGTH` and `MAX_DETAILS_LENGTH` bound the board
10. [x] L1 to L13, with one exception below

### The one thing not done

L11 asked for a healthcheck **and** a non-root container user. The healthcheck is in, and
the container reports healthy. Running as a non-root user is not, deliberately: the
`pm-data` volume already exists with its files owned by root, so switching the user would
leave a running install unable to write its own database, and the only way out would be
`docker compose down -v`, which destroys the board. Doing it safely needs an entrypoint that
fixes ownership before dropping privileges. That is worth doing before this is exposed to a
network, alongside M1, and not worth risking someone's data for on an MVP bound to
localhost.
