# Frontend

Next.js app for the Kanban board. Built as a static export and served by FastAPI. As of
Part 3 all state still lives in React and nothing is persisted; the backend serves the
files but the board makes no API call yet.

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
    page.tsx       renders KanbanBoard, nothing else
    globals.css    Tailwind import and the CSS custom properties for the palette
  components/
    KanbanBoard.tsx        owns all board state and every mutation handler
    KanbanColumn.tsx       one column, droppable, holds the sortable card list
    KanbanCard.tsx         one sortable card, with a Remove button
    KanbanCardPreview.tsx  non-interactive card rendered inside the DragOverlay
    NewCardForm.tsx        collapsed "Add a card" button expanding to a title/details form
  lib/
    kanban.ts      types, seed data, the moveCard reducer, createId
  test/
    setup.ts       jest-dom matchers
tests/
  kanban.spec.ts   Playwright end-to-end specs
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

`initialData` seeds five columns (Backlog, Discovery, In Progress, Review, Done) and eight
cards. It is currently the frontend's source of truth; from Part 7 it becomes the backend's
seed only.

## State

`KanbanBoard` is the single stateful component. Everything else is presentational and
receives callbacks as props.

- `board` holds the whole `BoardData` in one `useState`
- `activeCardId` tracks the card being dragged, for the `DragOverlay`
- `handleDragEnd` delegates to `moveCard` in `lib/kanban.ts`
- `handleRenameColumn`, `handleAddCard`, and `handleDeleteCard` update `board` directly

There is no card edit handler. The demo can add and delete cards but not change one. Part 7
adds editing.

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
rename, add, delete, the card count, and the new card form's validation and cancel;
`kanban.spec.ts` covers loading, console errors, the API route, add, delete, rename, and a
mouse-driven drag between columns.

Note that `@dnd-kit` gives each card article `role="button"` for keyboard sorting, and its
accessible name includes the nested Remove button's label. Scope delete lookups to the card
testid, or a role query will match both elements.

Playwright runs against the exported site served by FastAPI on port 8000, so the tests
exercise what actually ships. Run `npm run build` first. `reuseExistingServer` means it
uses the Docker container when one is already running, and otherwise starts uvicorn itself.

Drag and drop cannot be tested through `userEvent` in jsdom, because `@dnd-kit` needs real
pointer geometry. Test move logic through `moveCard` in Vitest and the real interaction in
Playwright.

## Selectors

Components expose stable test ids that both suites rely on. Do not rename them casually:

- `data-testid="column-{columnId}"` on each column
- `data-testid="card-{cardId}"` on each card
- `aria-label="Column title"` on the column title input
- `aria-label="Delete {card title}"` on each card's Remove button

## Planned changes

Tracked in `docs/PLAN.md`. In short:

- Part 4: a login form gating the board, driven by the session cookie
- Part 7: an API client, board state loaded and saved through the backend, card editing
- Part 10: an AI chat sidebar that refreshes the board when the AI changes it

The app stays on a single route at `/`. Login and board are chosen from client state rather
than separate pages, which keeps the static export simple.

## Conventions

- Arrow function components with a named export, no default exports except the App Router files
- Props typed with a local `type` alias named `{Component}Props`
- Keep new state in `KanbanBoard`; leave the other components presentational
- Follow the root `AGENTS.md` coding standards: simple, concise, no emojis
