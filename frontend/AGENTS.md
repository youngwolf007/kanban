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
    App.tsx                session gate: loading, login form, or workspace
    BackgroundGlow.tsx     the two decorative gradients shared by LoginForm and KanbanBoard
    LoginForm.tsx          username and password form; toggles between sign in and register
    Workspace.tsx          owns the signed-in user's board list and which one is open
    BoardSwitcher.tsx      dropdown in the header: switch, create, rename, delete, share a board
    BoardFilterBar.tsx     search text and priority filter, dims non-matching cards
    KanbanBoard.tsx        owns one open board's state and every content mutation handler
    ChatSidebar.tsx        the AI chat panel, overlaid on the board, scoped to one board
    KanbanColumn.tsx       one column, droppable, holds the sortable card list
    KanbanCard.tsx         one card, with a drag handle and Edit and Remove buttons
    KanbanCardPreview.tsx  non-interactive card rendered inside the DragOverlay
    CardMetaFields.tsx     priority/due-date/labels inputs shared by add and edit forms
    NewCardForm.tsx        collapsed "Add a card" button expanding to a full card form
    UndoToast.tsx          "Deleted X · Undo" toast shown after a card delete
    ThemeToggle.tsx        fixed corner button that flips light/dark mode
  lib/
    kanban.ts             types, seed data, the moveCard reducer, createId
    api.ts                fetch wrappers for the auth, boards, and chat APIs
    useOnClickOutside.ts  hook backing BoardSwitcher's click-away close
    theme.ts              read/resolve/apply the light or dark theme
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

`CardInput` (also in `lib/kanban.ts`) is the subset a form collects: every `Card` field but
`id`. `NewCardForm` and `KanbanCard`'s edit form both emit it, and `CardMetaFields` is the
priority/due-date/labels control group shared between them. The labels field is free text;
`parseLabels` splits it on commas and drops blank entries, and `isOverdue` compares a
card's `dueDate` against today to flag it in the UI.

`BoardFilterBar` holds a search box and a priority select. `KanbanBoard` keeps the
resulting `BoardFilters` in state (reset for free on every board switch, since `Workspace`
remounts `KanbanBoard` by key) and passes it down to each `KanbanColumn`, which marks a
card that fails `matchesFilters` as dimmed rather than removing it: cards stay in the DOM
and in `dnd-kit`'s `SortableContext`, so dragging is unaffected by an active filter.

Cards are held in a flat `cards` map; each column keeps an ordered `cardIds` array. Order
lives in the column, not on the card. This shape is what the backend stores as one board's
JSON blob, so keep the two in step.

`initialData` is no longer the app's source of truth. The backend owns the seed, as
`DEFAULT_BOARD` in `backend/app/models.py`, and `initialData` survives only as a test
fixture. It is tree shaken out of the shipped bundle. If you change one, change the other.

A board also has metadata outside that JSON: `BoardSummary` in `lib/api.ts`
(`{id, name, updatedAt, isOwner, ownerUsername}`), used for listing and switching between a
user's boards. Content (`BoardData`) and metadata (`BoardSummary`) are fetched and saved
separately, matching the backend's split between `/api/boards/{id}` (data) and
`/api/boards` / `/api/boards/{id}` `PATCH` (metadata).

`isOwner` and `ownerUsername` drive `BoardSwitcher`'s per-board actions: an owned board gets
Share, Rename, and Delete; a board someone else shared gets a "Shared by {ownerUsername}"
label and Leave instead. `BoardMember` (`{userId, username}`) is fetched on demand — only
when that board's Share panel is opened, via `listMembers`/`inviteMember`/`removeMember` in
`lib/api.ts` — rather than eagerly for every board in the list.

## State

`App` owns the session, as `Session` (`{id, username}`) from `/api/auth/me`, `login`, or
`register` — all three return the same shape. It calls `/api/auth/me` once on mount and
renders a loading state, the login form, or the workspace, passing `session.id` down as
`userId`. `page.tsx` renders `App` and nothing else.

`Workspace` owns the signed-in user's board list and which board is currently open: `boards`
(every `BoardSummary`) and `currentBoardId`. On mount it calls `GET /api/boards`; if the list
is empty (a brand new user) it calls `POST /api/boards` once to create a first board, so
signing in still lands straight on a board. It renders `KanbanBoard` keyed on
`currentBoardId`, so switching boards remounts it with a clean slate rather than trying to
reconcile one board's in-flight timers and refs against another's data. Create, rename, and
delete all go through Workspace, which keeps `boards` in sync with the server's response;
deleting the last board recreates one, the same as a brand new user.

`KanbanBoard` owns one open board's content state and every mutation handler for it. It
takes `boardId` (which board), `boards` and the switch/create/rename/delete callbacks (handed
to `BoardSwitcher`, rendered in the header), and optional `username`/`onSignOut`.

The board starts as `null` and is fetched from `GET /api/boards/{boardId}` on mount, showing
a loading state until it arrives. Every change goes through `applyChange(next, debounced?)`,
which sets state and then `PUT`s the whole board. Column rename passes `debounced: true` so
typing does not fire a request per keystroke; the timer is 500ms.

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
error, and whether it is open. It takes `boardId` and one callback, `onBoardChange`, and
sends `boardId` as `board_id` in every `POST /api/chat`. The conversation is scoped to one
board: an effect keyed on `boardId` clears the messages, draft, and error when it changes,
so switching boards starts a fresh conversation rather than sending one board's history as
another's context. When a reply carries a board the sidebar hands it over and `KanbanBoard`
adopts it through `adoptBoardFromAi` **without saving it**: `POST /api/chat` already stored
it, so saving would rewrite bytes that had just arrived.

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

### Dark mode

Theming is entirely a matter of which values the palette variables hold: `globals.css`
defines the light palette on `:root` and redefines the ones that need to change for dark
mode under `[data-theme="dark"]` (`--surface`, `--surface-strong`, `--navy-dark`,
`--gray-text`, `--stroke`, `--shadow`, `--primary-blue-text`, `--secondary-purple-text`,
`--scrim`, `--toast-bg`). Components never branch on the theme; they just read the same
`var(--x)` tokens as always, so a component that already follows the "use the variables"
rule above is dark-mode-correct for free. `--accent-yellow`, `--primary-blue`, and
`--secondary-purple` are not overridden — they are used as backgrounds/borders, or already
clear the AA contrast bar unchanged against the dark surface.

`--navy-dark` is the foreground/heading token; in dark mode it holds a light color, which
is why `body`'s `color` and `@theme inline`'s `--color-foreground` already read it instead
of a separate "text" variable. `--primary-blue-text` and `--secondary-purple-text` exist
because their non-text counterparts (`--primary-blue`, `--secondary-purple`) stay put as
button/background colors: text needs a lighter tint to clear AA on a dark surface, but a
button's background does not get lighter just because the page went dark. `--scrim` and
`--toast-bg` exist for the same reason: both want to stay dark in both themes (the chat
panel's dimming overlay, the undo toast's pill), so they cannot just read `--navy-dark`
once it flips to a light color.

Every dark-mode value was chosen by computing its actual contrast ratio against the
surface it renders on (relative luminance, same formula as the light-mode comments already
in `globals.css`), not by eye. Re-derive the ratio before changing one.

The mechanism lives in `lib/theme.ts` (`getStoredTheme`, `getSystemTheme`, `resolveTheme`,
`setDocumentTheme`, `persistTheme`) and `components/ThemeToggle.tsx`, rendered once by
`App.tsx` so it is present on the login form and every board. The theme is an attribute,
`data-theme` on `<html>`, not a class, and not React state that anything but the toggle's
own icon depends on. `layout.tsx` inlines a small blocking script (`next/script` with
`strategy="beforeInteractive"`) that sets `data-theme` before the first paint, reading
`localStorage` and falling back to `prefers-color-scheme`; without it the static export
would flash light before React hydrates and corrects it. `<html>` carries
`suppressHydrationWarning` because that attribute is deliberately set outside React's
render.

`ThemeToggle` itself renders `theme` state starting at `"light"` regardless of the real
preference, because Next's static export prerenders the page server-side, where there is
no `window` to read `matchMedia` or `localStorage` from; reading either at render time
breaks the build. The real value is resolved in a mount-only effect. This means the page's
colors are always correct on first paint (the inline script already set them), but the
toggle's own icon can flash from its light-mode default to the real one for a frame after
mount — a deliberate, contained tradeoff, not a bug to fix by making the initial render
theme-aware.

An explicit toggle click always wins over the OS preference from then on, because
`persistTheme` writes to `localStorage` and `resolveTheme` checks storage first.

## Testing

- `npm run test:unit` runs Vitest over `src/**/*.{test,spec}.{ts,tsx}` in jsdom
- `npm run test:e2e` runs Playwright over `tests/`
- `npm run test:all` runs both

Coverage: `kanban.test.ts` covers every `moveCard` case including no-ops, unknown ids, and
non-mutation, plus `createId`, `parseLabels`, and `isOverdue`; `KanbanBoard.test.tsx` covers
the seeded render, column rename and its debounce (including a rename still waiting when an
AI board arrives, and when the component unmounts), add, delete, the card count, card
editing, priority/due-date/labels display and editing (including the overdue flag), save-
error handling, the new card form's validation and cancel, the blank-title guard, and AI
board adoption, all driven directly with a fixed `boardId` and one-board `boards` list;
`Workspace.test.tsx` covers first-board creation for a new user, opening straight onto an
existing one, switching, creating, renaming, deleting (including recreating after the last
board is deleted), and the board-list load error; `BoardSwitcher.test.tsx` covers the
dropdown in isolation with mocked callbacks; `App.test.tsx` covers sign in, registration
(including a taken username), and sign out; `theme.test.ts` covers reading, resolving
(stored beats system, system as fallback), and applying a theme, including a storage
read/write that throws; `ThemeToggle.test.tsx` covers the initial icon/label for both a
light and dark system preference, a stored theme overriding the system preference, and
toggling in each direction; `kanban.spec.ts` covers loading, console errors, the API route,
add, delete, rename, and a mouse-driven drag between columns; `theme.spec.ts` covers the
light default, toggling in both directions (asserting the actual computed background
color, not just the `data-theme` attribute), following the OS preference when nothing is
stored, an explicit choice surviving both a reload and a later OS preference change, and
the toggle working before sign-in with the choice carrying into the board.

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
- `data-testid="auth-mode-toggle"` switches the login form between sign in and register
- `data-testid="board-error"` on the board's load or save error, or Workspace's board-list error
- `data-testid="workspace-error"` on a create/rename/delete failure once boards are loaded
- `data-testid="board-switcher"` the header control showing the open board's name
- `data-testid="board-menu"` the switcher's open dropdown
- `data-testid="board-option-{boardId}"` one board's row in the dropdown
- `data-testid="board-create"` the dropdown's "New board" button
- `aria-label="Rename {board name}"` starts renaming that board; the resulting field is
  `aria-label="New name for {board name}"` — two different controls, deliberately not the
  same label
- `aria-label="Delete {board name}"` deletes that board immediately, no confirmation
- `aria-label="Edit {card title}"` on each card's Edit button
- `aria-label="Card title"` and `aria-label="Card details"` on the card edit form
- `aria-label="Card priority"`, `aria-label="Card due date"`, and `aria-label="Card labels"`
  on the priority/due-date/labels controls, shared by `NewCardForm` and the card edit form
- `aria-label="Search cards"` and `aria-label="Filter by priority"` on `BoardFilterBar`'s
  controls; `data-testid="filter-summary"` on its match count
- `data-card-match="true"`/`"false"` on each card, reflecting whether it passes the active
  filters (always `"true"` when no filter is set)
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
- `data-testid="theme-toggle"` the light/dark toggle, fixed top-right on every screen;
  `aria-label` is "Switch to dark mode" or "Switch to light mode", whichever it does next

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
