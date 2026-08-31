# Frontend

Next.js app for the Kanban board. Built as a static export and served by FastAPI. The board
is loaded from and saved to the backend, so it is genuinely persistent.

## Stack

- Next.js 16.1.6, React 19.2.3, TypeScript 5, App Router
- Tailwind CSS 4 via `@tailwindcss/postcss`
- `@dnd-kit/core` and `@dnd-kit/sortable` for drag and drop
- `clsx` for conditional class names
- Vitest and Testing Library for unit tests, Playwright for end-to-end tests

## Layout

```
src/
  app/
    layout.tsx     root layout, Space Grotesk and Manrope via next/font/google
    page.tsx       renders App, nothing else
    globals.css    Tailwind import and the CSS custom properties for the palette
  components/
    App.tsx                session gate: loading, login form, or board
    BackgroundGlow.tsx     the two decorative gradients shared by LoginForm and KanbanBoard
    LoginForm.tsx          username and password form, calls the auth API
    KanbanBoard.tsx        owns all board state and every mutation handler
    ChatSidebar.tsx        the AI chat panel, overlaid on the board
    KanbanColumn.tsx       one column, droppable, holds the sortable card list
    KanbanCard.tsx         one card, with a drag handle and Edit and Remove buttons
    KanbanCardPreview.tsx  non-interactive card rendered inside the DragOverlay
    NewCardForm.tsx        collapsed "Add a card" button expanding to a title/details form
  lib/
    kanban.ts      types, seed data, the moveCard reducer, createId
    api.ts         fetch wrappers for the auth, board, and chat APIs
  test/
    setup.ts       jest-dom matchers
tests/
  helpers.ts         DEMO_BOARD, signIn, resetBoard, startFresh
  kanban.spec.ts     Playwright board specs
  auth.spec.ts       Playwright sign in, sign out, and session specs
  chat.spec.ts       Playwright AI chat specs, which call the real model
  persistence.spec.ts  Playwright specs that reload and check the board survived
```

`@/` is aliased to `src/` in both `tsconfig.json` and `vitest.config.ts`.

## Data model

Defined in `src/lib/kanban.ts` and shared by every component:

```ts
type Card = { id: string; title: string; details: string };
type Column = { id: string; title: string; cardIds: string[] };
type BoardData = { columns: Column[]; cards: Record<string, Card> };
```

Cards are held in a flat `cards` map; each column keeps an ordered `cardIds` array. Order
lives in the column, not on the card. This shape is what the backend will store as its JSON
blob, so keep the two in step.

`initialData` is no longer the app's source of truth. The backend owns the seed, as
`DEFAULT_BOARD` in `backend/app/models.py`, and `initialData` survives only as a test
fixture. It is tree shaken out of the shipped bundle. If you change one, change the other.

## State

`App` owns the session. It calls `/api/auth/me` once on mount and renders a loading state,
the login form, or the board. `page.tsx` renders `App` and nothing else.

`KanbanBoard` owns all board state. Everything else is presentational and receives
callbacks as props. It takes optional `username` and `onSignOut` props; when `onSignOut` is
given it renders the sign out control in the header.

The board starts as `null` and is fetched from `GET /api/board` on mount, showing a loading
state until it arrives. Every change goes through `applyChange(next, debounced?)`, which
sets state and then `PUT`s the whole board. Column rename passes `debounced: true` so typing
does not fire a request per keystroke; the timer is 500ms.

**A waiting rename holds a snapshot, so it must never outlive a newer one.** An immediate
save cancels it, because the board it is saving already contains the rename. On unmount the
rename is flushed instead of dropped, so renaming and signing out straight after keeps the
name. A board arriving from the AI drops it, because that board is already stored and saving
the older snapshot would undo it. Getting this wrong loses a change silently: the server
takes the stale board, local state keeps the new one, and nothing looks wrong until reload.

A failed save sets an error shown in the header and cleared by the next successful save.

- `board` holds the whole `BoardData` in one `useState`
- `activeCardId` tracks the card being dragged, for the `DragOverlay`
- `handleDragEnd` delegates to `moveCard` in `lib/kanban.ts`
- `handleRenameColumn`, `handleAddCard`, and `handleDeleteCard` update `board` directly

`handleEditCard` updates a card's title and details in place. Editing goes
through the same whole-board `PUT` as every other change.

A card with no details is stored with `details: ""`. `NO_DETAILS` in `lib/kanban.ts` is a
render-time fallback only: the AI never writes it, so storing it would make two identical
empty cards read differently depending on which one created them.

`KanbanColumn` keeps the title field's text in a local `draft`, adjusted during render from
`column.title` rather than in an effect, which is what React recommends for state derived
from a prop, and what the lint rules here enforce. A blank draft is never handed to
`onRename`: the API refuses a blank title, and a board holding one could never be saved
again, so the board keeps the last usable title and the field restores it on blur.

`ChatSidebar` owns the conversation: the messages, the draft, the pending flag, its own
error, and whether it is open. `KanbanBoard` passes it one callback, `onBoardChange`. When a
reply carries a board the sidebar hands it over and `KanbanBoard` adopts it through
`adoptBoardFromAi` **without saving it**: `POST /api/chat` already stored it, so saving would
rewrite bytes that had just arrived.

`moveCard(columns, activeId, overId)` is a pure function covering three cases: reorder
within a column, move to a specific position in another column, and drop onto a column
rather than a card (appends to the end). It returns the original array unchanged when the
move is a no-op or an id is unknown. Being pure, it is directly unit testable.

`createId(prefix)` builds ids from a random suffix and a timestamp. It is non-deterministic,
so avoid asserting on generated ids in tests.

## Styling

The palette from the root `AGENTS.md` is exposed as CSS custom properties in `globals.css`
and used through Tailwind arbitrary values, for example
`text-[var(--navy-dark)]` and `bg-[var(--accent-yellow)]`. Use the variables, never
hardcoded hex values, so the palette stays in one place.

`font-display` and `font-body` map to the two `next/font/google` families loaded in
`layout.tsx`. Note that `next/font/google` fetches the fonts at build time, so the Docker
build stage needs network access.

## Testing

- `npm run test:unit` runs Vitest over `src/**/*.{test,spec}.{ts,tsx}` in jsdom
- `npm run test:e2e` runs Playwright over `tests/`
- `npm run test:all` runs both

Coverage: `kanban.test.ts` covers every `moveCard` case including no-ops, unknown ids, and
non-mutation, plus `createId`; `KanbanBoard.test.tsx` covers the seeded render, column
rename and its debounce (including a rename still waiting when an AI board arrives, and
when the component unmounts), add, delete, the card count, card editing, save-error
handling, the new card form's validation and cancel, the blank-title guard, and AI board
adoption; `kanban.spec.ts` covers loading, console errors, the API route, add, delete,
rename, and a mouse-driven drag between columns.

One selector trap, hit in practice:

- Next renders its own `role="alert"` route announcer, so `getByRole("alert")` is ambiguous
  in Playwright. Use the `login-error` testid instead.

The drag listeners sit on a dedicated handle button inside each card, not on the article.
Carrying them on the article gave it `role="button"` from `@dnd-kit` while Edit and Remove
sat inside it, which is ambiguous both to a screen reader and to a role query. A Playwright
drag must therefore start from the handle's bounding box, not the card's.

The signed-out `/api/auth/me` check answers 401 by design, and Chrome logs that as a failed
resource. The console-error spec filters that one URL out rather than treating it as a bug.

The board persists, so end-to-end tests are not isolated by default.
Playwright runs with `workers: 1` because every spec drives the same user and the same
stored board, and `startFresh` resets the board between tests. Sign in through the UI before
calling `resetBoard`: an API login sets the cookie, the app then goes straight to the board,
and a UI sign in has no form left to fill.

Playwright runs against the exported site served by FastAPI on port 8000, so the tests
exercise what actually ships. Run `npm run build` first. `reuseExistingServer` means it
uses the Docker container when one is already running, and otherwise starts uvicorn itself.

Drag and drop cannot be tested through `userEvent` in jsdom, because `@dnd-kit` needs real
pointer geometry. Test move logic through `moveCard` in Vitest and the real interaction in
Playwright.

## Selectors

Components expose stable test ids that both suites rely on. Do not rename them casually:

- `data-testid="login-error"` on the login form's error message
- `data-testid="board-error"` on the board's load or save error
- `aria-label="Edit {card title}"` on each card's Edit button
- `aria-label="Card title"` and `aria-label="Card details"` on the card edit form
- `data-testid="column-{columnId}"` on each column
- `data-testid="card-{cardId}"` on each card
- `aria-label="Column title: {column title}"` on the column title input; both suites match
  on the prefix, so scope the lookup to the column
- `aria-label="Drag {card title}"` on each card's drag handle
- `aria-label="Delete {card title}"` on each card's Remove button
- `data-testid="chat-sidebar"` on the open chat panel
- `data-testid="chat-open"` and `data-testid="chat-close"` on the panel's toggles
- `data-testid="chat-user"` and `data-testid="chat-assistant"` on message bubbles
- `data-testid="chat-pending"` while a reply is in flight, `chat-error` when one fails
- `aria-label="Message the assistant"` on the chat composer

## The chat panel

`ChatSidebar` is **overlaid on the board and starts closed**, which is a deliberate layout
decision rather than a default worth flipping.

Five columns need the whole width. When the panel sat in the flex row beside the board, a
1280px viewport left 848px for five columns, or 146px each, and a card's text column came
out about 37px wide. Text then wrapped to a few characters a line: one card measured 1698px
tall, its column 3532px, and dragging broke because the card sat far below the viewport.
Widening the columns to a readable 240px needs roughly 1300px for five, more than the
viewport has. There is no arrangement at this width where the panel and five usable columns
coexist, so the panel floats above the board and the user opens it when they want it.

If you ever move it back into the flow, re-run the two drag specs. They are what caught it.

## Routing

The app stays on a single route at `/`. Login and board are chosen from client state rather
than separate pages, which keeps the static export simple.

## Conventions

- Arrow function components with a named export, no default exports except the App Router files
- Props typed with a local `type` alias named `{Component}Props`
- Keep new state in `KanbanBoard`; leave the other components presentational
- Follow the root `AGENTS.md` coding standards: simple, concise, no emojis
