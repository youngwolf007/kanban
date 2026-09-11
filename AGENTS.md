# The Project Management web app

## Business Requirements

This project is a Project Management App. Key features:
- A user can register an account and sign in; the seeded demo account (`user` / `password`)
  still exists for local trials, but registration is real, not hardcoded
- When signed in, a user sees a Kanban board representing their project, and can hold any
  number of boards, switching between them from the header
- A board's owner can invite other registered users to it by username; an invited member can
  read and edit the board's content but cannot rename, delete, or invite others to it, and
  can leave at any time
- The Kanban board has fixed columns that can be renamed
- The cards on the Kanban board can be moved with drag and drop, edited, and carry a
  priority, an optional due date, and free-form labels; a search box and priority filter
  narrow what is shown
- There is an AI chat feature in a sidebar; the AI is able to create / edit / move one or
  more cards, including their priority, due date, and labels

## Limitations

This runs locally (in a Docker container). There is no email, password reset, or
notification system, and no way to browse other users to invite beyond typing their exact
username.

## Technical Decisions

- NextJS frontend
- Python FastAPI backend, including serving the static NextJS site at /
- Everything packaged into a Docker container
- Use "uv" as the package manager for python in the Docker container
- Use OpenRouter for the AI calls. An OPENROUTER_API_KEY is in .env in the project root
- Use `openai/gpt-oss-120b` as the model
- Use SQLLite local database for the database, creating a new db if it doesn't exist
- Start and Stop server scripts for Mac, PC, Linux in scripts/

## Color Scheme

- Accent Yellow: `#ecad0a` - accent lines, highlights
- Blue Primary: `#209dd7` - links, key sections, non-text UI (borders, icons, backgrounds)
- Blue Primary (text): `#0e7490` - the same blue used as actual text; `#209dd7` is 3.06:1
  on white, below the 4.5:1 AA bar for text, though it clears the 3:1 non-text bar fine
- Purple Secondary: `#753991` - submit buttons, important actions
- Dark Navy: `#032147` - main headings
- Gray Text: `#6b6b6b` - supporting text, labels (was `#888888`, which is 3.54:1 on white,
  below the 4.5:1 AA bar; darkened until it cleared AA)

## Coding standards

1. Use latest versions of libraries and idiomatic approaches as of today
2. Keep it simple - NEVER over-engineer, ALWAYS simplify, NO unnecessary defensive programming. No extra features - focus on simplicity.
3. Be concise. Keep README minimal. IMPORTANT: no emojis ever
4. When hitting issues, always identify root cause before trying a fix. Do not guess. Prove with evidence, then fix the root cause.

## Working documentation

Reference documentation for the current system lives in the docs/ directory and in each
directory's own `AGENTS.md`. Start with `CLAUDE.md` in the project root.