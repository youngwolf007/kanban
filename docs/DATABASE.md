# Database

SQLite, one file, created on first run. Two tables: `users` and `boards`.

## Approach

A board is stored as **one JSON document in one column**, not as normalized `columns` and
`cards` tables.

Reasons, in order of weight:

1. The frontend already holds the whole board as a single `BoardData` object. Storing that
   shape verbatim means no mapping layer in either direction.
2. The AI chat route sends the entire board to the model and takes an entire board back.
   With a JSON column that round trip is a read, a validate, and a write. Normalized tables
   would need a diffing layer to turn the model's answer into row inserts, updates, and
   deletes.
3. There are no queries that look inside a board. Nothing asks "which cards are in
   progress across all users", so the indexing that normalization buys would go unused.

The cost is that the database cannot query or constrain anything inside the document.
Validation therefore lives in the application, in Pydantic models, and is described under
[Invariants](#invariants) below.

## Schema

```sql
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
```

| Column | Notes |
| --- | --- |
| `boards.user_id` | Not unique: a user can own any number of boards. The MVP's one-board-per-user rule was enforced by a `UNIQUE` constraint here; dropping that one keyword, plus the `name` column, is what allows several boards |
| `boards.name` | The board's display name, shown in the board switcher. Not part of the board JSON |
| `boards.data` | The board JSON, serialised with `json.dumps` |
| `boards.created_at`, `boards.updated_at` | ISO 8601 UTC, same format as `users.created_at` |

`users` is repeated here only so the schema reads as a whole.

## Board JSON

The `data` column holds exactly the frontend's `BoardData` type from
`frontend/src/lib/kanban.ts`. The two must stay in step.

```ts
type Priority = "low" | "medium" | "high";
type Card = {
  id: string;
  title: string;
  details: string;
  priority: Priority | null;
  dueDate: string | null; // ISO date, YYYY-MM-DD
  labels: string[];
};
type Column = { id: string; title: string; cardIds: string[] };
type BoardData = { columns: Column[]; cards: Record<string, Card> };
```

```json
{
  "columns": [
    { "id": "col-backlog", "title": "Backlog", "cardIds": ["card-1", "card-2"] },
    { "id": "col-discovery", "title": "Discovery", "cardIds": ["card-3"] },
    { "id": "col-progress", "title": "In Progress", "cardIds": [] },
    { "id": "col-review", "title": "Review", "cardIds": [] },
    { "id": "col-done", "title": "Done", "cardIds": [] }
  ],
  "cards": {
    "card-1": {
      "id": "card-1",
      "title": "Align roadmap themes",
      "details": "Draft quarterly themes with impact statements and metrics.",
      "priority": "high",
      "dueDate": "2026-09-25",
      "labels": ["roadmap", "q3"]
    },
    "card-2": {
      "id": "card-2",
      "title": "Gather customer signals",
      "details": "Review support tags, sales notes, and churn feedback.",
      "priority": "medium",
      "dueDate": null,
      "labels": ["research"]
    },
    "card-3": {
      "id": "card-3",
      "title": "Prototype analytics view",
      "details": "Sketch initial dashboard layout and key drill-downs.",
      "priority": null,
      "dueDate": null,
      "labels": []
    }
  }
}
```

Cards live in a flat `cards` map. Each column holds an ordered `cardIds` array, so **order
is a property of the column, not of the card**. A card's position is its index in that
array. There is no `order` or `position` field, and moving a card is a change to one or two
`cardIds` arrays.

Every card carries `id`, `title`, `details`, `priority`, `dueDate`, and `labels`. All but
`id` are user-editable, `id` only implicitly, by deleting a card and adding another.
`priority`, `dueDate`, and `labels` default to `null`, `null`, and `[]`, so a board written
before these fields existed reads back unchanged: Pydantic fills in the defaults, no
migration needed.

## Invariants

The API validates these on every write and rejects the whole request if any fails. SQLite
cannot enforce them, so they are enforced in the application.

1. Every id in every `cardIds` array has a matching key in `cards`.
2. Every key in `cards` appears in exactly one `cardIds` array. No orphans, no duplicates.
3. Each `cards[key].id` equals its own key.
4. Column ids are unique within the board.
5. `title` is a non-empty string once trimmed. `details` may be empty.

`priority` must be `null`, `"low"`, `"medium"`, or `"high"`. `dueDate` must be `null` or an
ISO date string. `labels` are trimmed, non-blank, and capped at `MAX_LABELS` entries of
`MAX_LABEL_LENGTH` characters each. None of these three participate in the five numbered
invariants above: they describe a card, not the board's shape, so a bad value is a plain
Pydantic field error rather than a cross-referenced invariant failure.

The board is also bounded: at most `MAX_COLUMNS` columns and `MAX_CARDS` cards, with titles
up to `MAX_TITLE_LENGTH` and details up to `MAX_DETAILS_LENGTH`, all in `models.py`. The
whole board is serialised into the AI prompt on every chat turn, so its size is an upstream
cost as well as a storage question.

Rule 1 matters most: it is the one that a bad AI response is most likely to break, and the
one that would render cards invisible without erroring.

## Seeding

A user has no `boards` rows until they create one. `POST /api/boards` inserts a row
containing the same demo board the frontend used to ship as `initialData`: five columns
(Backlog, Discovery, In Progress, Review, Done) and eight cards, under the given name (or
"New board"). The frontend calls this once, automatically, the first time a signed-in user
has an empty board list, so the experience of landing straight on a board is unchanged even
though creation is no longer implicit on the backend.

That keeps registering a user cheap: `POST /api/auth/register` only ever writes to `users`.

## API contract

Every board route requires a signed-in user through the `require_user` dependency and acts
only on boards that user owns. A board id that does not exist, or belongs to someone else,
is a 404 either way, so existence and ownership are indistinguishable from the outside.

| Route | Body | Returns |
| --- | --- | --- |
| `GET /api/boards` | none | The user's boards, as `{id, name, updatedAt}`, most recently updated first |
| `POST /api/boards` | `{name?}` | The new board's summary |
| `GET /api/boards/{id}` | none | The board's full data |
| `PUT /api/boards/{id}` | a whole board | The board as stored |
| `PATCH /api/boards/{id}` | `{name}` | The board's summary with the new name |
| `DELETE /api/boards/{id}` | none | 204, no body |

| Status | Meaning |
| --- | --- |
| 200 / 201 / 204 | Success |
| 401 | Not signed in |
| 404 | The board does not exist or is not owned by the signed-in user |
| 422 | Body is not a valid board (or name), by the invariants and limits above |

`PUT` **replaces the entire board's data**. There are no per-card or per-column endpoints.

Rationale: the storage is a single document, the AI returns a whole board, and the frontend
already holds the whole board in memory. One replace endpoint serves all three. Granular
endpoints would mean more routes, more tests, and a diffing layer, for an app whose boards
are a few kilobytes. A board's name lives outside that document (it is metadata about the
row, not board content), which is why renaming is its own small endpoint rather than a
`PUT` field.

`POST /api/chat` also takes a `board_id` in its body now, alongside `message` and
`history`, to say which board it is reading and changing.

### Card editing

Editing a card is not a separate endpoint. The client changes `cards[id].title` or
`cards[id].details` in the board it holds and `PUT`s the whole board, exactly as it does for
a move, a rename, an add, or a delete.

## Concurrency

`PUT` is **last write wins**. The request body replaces the stored document outright, with
no version check and no merge.

Two browser tabs editing the same board will have the later save silently overwrite the
earlier one. This is accepted for an app with one browser tab open on any given board at a
time.

The upgrade path, if it is ever needed, is to return `updated_at` from `GET`, require it on
`PUT`, and answer 409 when it no longer matches. That is deliberately **not** being built
now.

One case worth watching: an AI chat request and a user's drag can be in flight at once, and
whichever lands second wins. The client refreshes its board from the chat response, which
keeps the UI honest about what was actually stored.

## Storage and persistence

| Context | Path |
| --- | --- |
| Docker | `/data/pm.db`, set by `DB_PATH` in the Dockerfile |
| Native | `pm.db` in the repo root, gitignored |

In Docker, `/data` is the `pm-data` named volume declared in `docker-compose.yml`. It is not
a bind mount, so it lives inside Docker rather than in the project directory.

`scripts/stop.sh` runs `docker compose down`, which removes the container but keeps the
volume, so the board survives a stop and start.

To reset everything, remove the volume with `docker compose down -v`. The next start
recreates the database, the seeded user, and a fresh demo board.

## Migrations

There is no migration tool and none is planned for the MVP. `init_db()` runs
`CREATE TABLE IF NOT EXISTS` on every startup, which is enough while the schema only ever
gains tables.

Changing the shape of the board JSON is the case to think about, because old rows keep the
old shape. While the app is pre-release, the answer is to delete the volume and reseed. If
the shape ever needs to change against data worth keeping, add a `version` key to the JSON
and upgrade on read.

The move from one board per user to many followed the same rule: it changed `boards`'
columns (dropped the `UNIQUE` on `user_id`, added `name` and `created_at`), not the board
JSON, so `CREATE TABLE IF NOT EXISTS` cannot pick it up on an existing database. A `pm.db`
from before that change needs the same delete-and-reseed treatment.

