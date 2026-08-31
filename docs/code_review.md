# Code Review

A full review of the repository at commit `6aeb520` ("code-review-fixes"), plus the
documentation cleanup currently uncommitted in the working tree (stripping references to
`docs/PLAN.md` and the prior `docs/code_review.md`, both now deleted). Covers the backend,
the frontend, the container setup, the scripts, CI, and repository hygiene.

The findings below are kept as written, in the present tense of the review, as a record of
what was found. See [Actions, in order](#actions-in-order) at the end for what has since
been applied.

## Verdict

The codebase is still in good shape overall, and the prior review's fixes hold up: the
debounced-rename interleaving (its H1), the malformed-board and duplicate-id guards (H2,
H3), the empty-`choices` guard (H4), and the `SECRET_KEY` generation in the start scripts
(M1) were all spot-checked directly against the current code and are exactly as described.

Two findings below are as serious as anything in the last review. H1 is not a code defect
but a process one: CI is currently failing on `main`, which means the safety net every
other finding in this document (and the last one) depends on is not actually running for
every change. H2 is a genuine data-loss bug, in the same family as the previously-fixed
H1/H3 but in a path those fixes did not cover: the AI chat route can be made to silently
replace a user's board with nothing.

## How this review was done

Every source file was read: `backend/app/*.py`, `frontend/src/**`, `docs/*`, both script
pairs, the `Dockerfile`, `docker-compose.yml`, and `.github/workflows/ci.yml`. The two
high-severity findings below were then verified against live evidence rather than left as
inference, per this project's root-cause-before-fix standard: H1 against the actual GitHub
Actions run log (`gh run view --log-failed`), and H2 by tracing the exact code path through
`chat.py` and `models.py` line by line.

The only recorded CI run (for this commit) shows the backend suite at 93 passed, 2 failed,
4 deselected. `README.md:34`'s "81 tests, no network needed" is accordingly stale — the
current offline count is 95, not 81 — a symptom of the same gap as H1, not a separate
finding.

---

## High

### H1. CI is red on `main`

`.github/workflows/ci.yml`

The `backend` and `frontend` jobs run independently, with no `needs:` dependency and no
artifact sharing between them. `backend/tests/test_static.py` requires a built
`frontend/out` to exist (it asserts `GET /` returns the exported page and its `_next/`
assets), but nothing in the `backend` job ever builds it.

This is not theoretical — it is the actual, current state of `main`:

```
$ gh run list --limit 1
conclusion: failure   headBranch: main   name: CI

$ gh run view --log-failed
FAILED tests/test_static.py::test_root_serves_exported_frontend -
  RuntimeError: StaticFiles directory '.../frontend/out' does not exist.
FAILED tests/test_static.py::test_root_serves_the_built_assets -
  RuntimeError: StaticFiles directory '.../frontend/out' does not exist.
2 failed, 93 passed, 4 deselected in 18.75s
```

It only passes locally because a native `npm run build` was run by hand at some point,
leaving `frontend/out` sitting in the working tree. `CLAUDE.md`'s "CI runs this too" note
(re: `ruff check`) is accurate for lint, but the suite behind it has been failing since
this commit landed.

**Action.** Give the `backend` job a built `frontend/out` before `pytest` runs — either
`needs: frontend` plus `actions/upload-artifact`/`download-artifact` for `frontend/out`, or
build the frontend inline in the `backend` job. Either way, re-run CI to confirm green
before trusting it as a gate again.

### H2. The AI chat path can silently wipe the board

`backend/app/chat.py:172`, `backend/app/chat.py:193-206`, `backend/app/models.py:43-44`

`ask_for_json`'s "usable response" check is:

```python
if not isinstance(data, dict) or not (data.get("reply") or data.get("board")):
```

An empty `board: {}` is falsy in Python, so this check is satisfied whenever `reply` is
non-empty — an empty-but-present board is never treated as "no usable response."

From there, in `chat()`: `returned = data.get("board")` is `{}`, which `is not None`, so
execution proceeds to `to_stored_shape({})` → `BoardData.model_validate({"columns": [],
"cards": {}})`. `BoardData.columns` and `BoardData.cards` (`models.py:43-44`) have a
`max_length` cap but no `min_length`, and the invariant validator (`models.py:46-74`) is
satisfied vacuously when both collections are empty — every check in it is a no-op over an
empty list. The empty board validates cleanly, gets persisted via `save_board`, and is
handed back to the client as `ChatResponse(board=updated)`, which the frontend adopts
through `adoptBoardFromAi` without question.

A model that returns ordinary reply text alongside a non-null-but-empty board — a
truncated response, a provider that answers the question but drops the board payload,
anything short of returning `board: null` outright — silently replaces the user's real
board with nothing, on both server and client, with no error surfaced anywhere. This is
exactly the class of bug the prior review's H1 and H3 addressed (silent data loss reachable
by ordinary use), in a path neither of those fixes touches. `backend/AGENTS.md` documents
the `board == null` ("untouched") case but says nothing about a non-null, empty one.

**Action.** Reject a returned board with no columns and no cards the same way a malformed
one is rejected — 502, not a silent save. Add a regression test that returns `{"reply":
"Done!", "board": {"columns": [], "cards": []}}` from a mocked `ask` and asserts the
board is neither saved nor returned.

---

## Medium

### M1. The single riskiest documented interaction has no test

`frontend/src/components/KanbanBoard.tsx:105-114`, `CLAUDE.md`

`CLAUDE.md` calls out, in its own words, that a board arriving from the AI while a rename
is still debouncing is "the trickiest case" and that "getting this wrong loses a change
silently." The mechanism (`adoptBoardFromAi` cancels the pending rename rather than
flushing it, since the AI's board already reflects everything up to that point) is
implemented correctly by inspection, and the three neighboring debounce scenarios are well
tested (`KanbanBoard.test.tsx:209-288`: immediate-save-cancels-pending, and
flush-on-unmount). But no test in either suite exercises an AI-sourced board arriving
*while* a rename is still within its 500ms window — the specific interleaving the
documentation singles out as the one most likely to be gotten wrong. The `ai chat` describe
block (`KanbanBoard.test.tsx:370-434`) covers board adoption on its own, not concurrently
with a pending rename.

**Action.** Add a test: start a rename, trigger an AI board update before the debounce
timer fires, and assert the rename's `PUT` never goes out.

### M2. A provider-exclusion test that can't catch a regression to what it's testing

`backend/tests/test_ai.py:77-80`

```python
def test_excludes_the_provider_that_ignores_response_format(self, openai_class):
    ask(QUESTION)
    _, kwargs = openai_class.return_value.chat.completions.create.call_args
    assert kwargs["extra_body"] == {"provider": PROVIDER_ROUTING}
```

This compares the value sent against the same `PROVIDER_ROUTING` constant it was built
from, not against a literal `{"ignore": ["DeepInfra", "SiliconFlow"]}`. If someone edits or
empties `PROVIDER_ROUTING` in `ai.py`, this test still passes — it only proves the constant
was passed through unchanged, not that it still names the right providers. The two provider
names (backed, per `ai.py`'s comment, by a four-run measurement) are recorded nowhere a
test would catch their loss.

**Action.** Assert against the literal provider list, not the constant under test.

---

## Low and hygiene

| # | Finding | Location | Action |
| --- | --- | --- | --- |
| L1 | Byte-for-byte duplicated decorative gradient markup, hand-deriving `--primary-blue`/`--secondary-purple` as literal `rgba()` triples instead of referencing the CSS custom properties | `KanbanBoard.tsx:216-217`, `LoginForm.tsx:31-32` | Factor into one shared component or reference the custom properties directly |
| L2 | `frontend/AGENTS.md` contradicts itself: says `page.tsx` renders `KanbanBoard` directly in one place, and correctly says it renders `App` in another | `frontend/AGENTS.md:20` vs `frontend/AGENTS.md:67` | Fix line 20 to match line 67 and the actual code |
| L3 | `frontend/AGENTS.md`'s description of `KanbanBoard.test.tsx` lists only five scenarios; the file also covers card editing, save-error handling, blank-title guards, and AI board adoption | `frontend/AGENTS.md:136-140` | Expand the description so the doc doesn't undersell current coverage |
| L4 | `to_stored_shape`'s docstring claims it raises `ValueError` for two specific cases, but a card missing `id` raises `KeyError` and a non-dict card raises `TypeError` — both are still caught correctly by the caller, so this is a doc gap, not a bug | `backend/app/chat.py:129-146` | Update the docstring to name all three exception types |
| L5 | No type checker (mypy/pyright) configured for the backend; ruff's `UP` ruleset checks syntax modernity, not type correctness, despite every function being fully annotated | `backend/pyproject.toml` | Add a type checker to CI if the annotations are meant to be enforced, or note that they're advisory only |
| L6 | `test_health.py` and `test_static.py` build `TestClient(app)` at module scope instead of using `conftest.py`'s `client`/`signed_in` fixtures — harmless here since neither touches the DB, but inconsistent with every other test file | `backend/tests/test_health.py:5`, `backend/tests/test_static.py:5` | Use the shared fixtures for consistency |
| L7 | The container still runs as root; no `USER` directive alongside the `HEALTHCHECK` | `Dockerfile` | Carried forward from the prior review's L11 — see below, still deliberately deferred |

---

## Not faults

Recorded so a later reader does not re-open them.

- **Last write wins on `PUT /api/board`, the closed-by-default chat panel, the two-provider
  exclusion, and the board stored as one JSON document.** All previously documented as
  deliberate and measured; still hold, unchanged.
- **`initialData` surviving in `lib/kanban.ts`.** Confirmed still a test fixture only, not
  reachable from the running app; the seed used at runtime is `DEFAULT_BOARD` in
  `models.py`.
- **`ask_for_json` returning whichever status/detail (502 vs 503) came from the last failed
  attempt across retries.** `chat.py`'s own docstring names this as an accepted tradeoff
  ("The status of the last failure is what the caller sees"), not an oversight.
- **The container still running as root (L7 above).** The prior review deferred this
  deliberately: the `pm-data` volume's files are already root-owned, and switching users
  without a chown-first entrypoint would break an existing install's ability to write its
  own database. That reasoning is still sound and nothing has changed to invalidate it —
  worth revisiting only alongside a real chown-on-start entrypoint, not on its own.
- **The uncommitted documentation cleanup in the working tree.** Diffed directly
  (`git diff HEAD`) across `AGENTS.md`, `CLAUDE.md`, `README.md`, `backend/AGENTS.md`,
  `frontend/AGENTS.md`, and `docs/DATABASE.md`: every change strips a now-dangling
  reference to `docs/PLAN.md` or the prior `docs/code_review.md` (both deleted in the same
  tree). Mechanical and consistent, no functional change, no reference left dangling.

## Actions, in order

1. [x] H1: give the `backend` CI job a built `frontend/out` before `pytest` runs, then
   confirm a green run before trusting CI as a gate again.
2. [x] H2: reject an AI-returned board with no columns and no cards, the same way a
   malformed one is already rejected, with a regression test.
3. [x] M1: add a test for an AI board update arriving while a rename is still debouncing.
4. [x] M2: assert the literal excluded-provider list in `test_ai.py`, not the constant
   under test.
5. [x] L1 through L6: straightforward cleanup, any order.
6. [ ] L7 / non-root container user: still correctly deferred; revisit only alongside a
   chown-on-start entrypoint, and only if this is heading toward exposure beyond localhost.
