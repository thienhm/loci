# Loci — Implementation Plan

**Date:** 2026-03-08
**Status:** Approved
**Design doc:** `docs/plans/2026-03-08-loci-design.md`

---

## Agent Guidelines

### Progress Tracking

**Phase 1 (before Loci exists):** Mark checkboxes in this file as tasks complete — `- [ ]` → `- [x]`.

**After Phase 1 is done:** Run `loci init` inside this repo (prefix: `LCI`) and create tickets for each remaining phase. From that point, track all progress in Loci itself. This also serves as the first dogfooding test.

---

### Test-Driven Development (TDD)

**All phases from Phase 3 onward must follow TDD:**

1. Write failing tests first
2. Implement until tests pass
3. Run the full suite before marking a phase done: `bun test` (from root or per-package)

**Test locations:**

- `packages/cli/src/__tests__/` — CLI unit tests (`bun test --cwd packages/cli`)
- `packages/server/src/__tests__/` — server data + route integration tests (`bun test --cwd packages/server`)
- Future packages follow the same pattern: `src/__tests__/` inside the package

**Testing tools:** Bun's built-in test runner (`bun:test`). For server routes, use Fastify's `inject()` — no real HTTP server needed. Isolate filesystem tests with temp dirs and `process.env.HOME` overrides.

---

### UI Design Work

If any UI design decisions are needed during implementation (new components, layout choices, color/spacing decisions not covered by existing docs), the implementing agent **MUST** use the `ui-ux-pro-max` skill before writing any UI code.

```
Skill: ui-ux-pro-max:ui-ux-pro-max
```

The existing design system is at `docs/design-system/loci/MASTER.md` and page-specific files at `docs/design-system/loci/pages/`. Always check these first before invoking the skill.

---

## Execution Order

> **IMPORTANT:** Phases are numbered for reference but MUST be executed in this order:
> **Phase 1 → Phase 2 → Phase 4 → Phase 3 → Phase 5 → Phase 6**
>
> Reason: Phase 4 (Web UI) needs Phase 2 (Server/API) to exist first.
> Phase 3 (MCP) builds on the same data layer as Phase 2.

---

## Monorepo Structure

```
loci/
  packages/
    shared/     ← TypeScript types, schemas, shared utilities
    cli/        ← Commander.js CLI (loci binary)
    server/     ← Fastify server (REST API + MCP + static files)
    web/        ← React + Vite frontend
  docs/
    plans/      ← design and implementation docs
  tasks/        ← Loci tickets for this project (meta!)
  bun.lockb
  package.json  ← workspace root
  tsconfig.json
```

---

## Phase 1 — Foundation

> Goal: `loci init` and `loci add` working end-to-end with real files on disk

### 1.1 Monorepo setup

- [x] Init root `package.json` with Bun workspaces
- [x] Create `packages/shared`, `packages/cli`, `packages/server`, `packages/web`
- [x] Configure root `tsconfig.json` with path aliases
- [x] Add `.gitignore`

### 1.2 Shared types (`packages/shared`)

- [x] `Project` type — id, name, prefix, nextId, createdAt
- [x] `Ticket` type — id, title, status, priority, labels, assignee, progress, createdAt, updatedAt
- [x] `Registry` type — list of `{ id, name, prefix, path }`
- [x] Status enum: `todo | in_progress | done`
- [x] Priority enum: `low | medium | high`
- [x] Assignee format: `"human"` (project owner, no username needed) or `"agent:<name>"` (e.g. `"agent:claude"`); `null` when unassigned
- [x] ID generation utility: `formatId(prefix, nextId)` → `"APP-001"`
  - Implementation: `prefix + "-" + String(nextId).padStart(3, "0")`
  - No upper cap — naturally grows beyond 3 digits: APP-999 → APP-1000
- [x] Progress field: integer 0–100, manual only, defaults to 0, never auto-calculated

### 1.3 CLI scaffold (`packages/cli`)

- [x] Install Commander.js
- [x] Wire up `loci` binary entry point via `package.json#bin`
- [x] Register subcommands: `init`, `add`, `list`, `status`, `serve`

### 1.4 `loci init`

- [x] Prompt for project name and prefix (validate: uppercase, 2–5 chars)
- [x] Create `.loci/project.json` in current directory
- [x] Create/update `~/.loci/registry.json` — append new project entry
- [x] Generate `LOCI.md` in workspace root
- [x] Detect and append pointer to `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `AGENTS.md` if they exist
- [x] Print success message with next steps

### 1.5 `loci add`

- [x] Walk up directory tree to find `.loci/` (or error if not found)
- [x] Atomically increment `nextId` in `project.json`
- [x] Create `.loci/tickets/<ID>/` folder
- [x] Write `ticket.json` with defaults: `{ status: "todo", priority: "medium", assignee: null, labels: [], progress: 0 }`
- [x] Write `description.md` with empty content (always created — this is the required default doc)
- [x] Write `attachments.json` with empty array `[]`
- [x] Print created ticket ID

> Note: `description.md` and `attachments.json` are created here (Phase 1), not in Phase 5. Phase 5 only adds the UI to view/edit them.

### 1.6 `loci list`

- [x] Read all `ticket.json` files in `.loci/tickets/`
- [x] Print table: ID | Title | Status | Priority | Assignee

### 1.7 `loci status <id> <status>`

- [x] Find ticket by ID, validate status value
- [x] Update `ticket.json` with new status + `updatedAt`
- [x] Print confirmation

### 1.8 Bootstrap Loci on itself

- [x] Run `loci init` in this repo (project name: "Loci", prefix: `LCI`)
- [x] Create tickets for Phase 2, 3, 4, 5, 6 in Loci
- [x] From this point, track all remaining progress in Loci itself

---

## Phase 2 — Server ✅

> Goal: Fastify running with REST API, all data readable/writable via HTTP

### 2.1 Server scaffold (`packages/server`)

- [x] Install Fastify + plugins (`@fastify/cors`, `@fastify/static`)
- [x] Entry point: `loci serve` starts server on port 3333
- [x] Load `~/.loci/registry.json` on startup (read lazily per-request)
- [x] Serve placeholder page at `GET /` — web UI coming in Phase 4

### 2.2 REST API routes

> Note: all ticket routes are nested under `/api/projects/:projectId/` — `:projectId` is a UUID.

- [x] `GET  /api/projects` — all projects from registry
- [x] `GET  /api/projects/:projectId` — single project metadata
- [x] `GET  /api/projects/:projectId/tickets` — all tickets (with optional `?status=`, `?assignee=`)
- [x] `GET  /api/projects/:projectId/tickets/:ticketId` — single ticket + doc list
- [x] `POST /api/projects/:projectId/tickets` — create ticket
- [x] `PATCH /api/projects/:projectId/tickets/:ticketId` — update ticket fields
- [x] `GET  /api/projects/:projectId/tickets/:ticketId/docs/:filename` — read a markdown doc
- [x] `PUT  /api/projects/:projectId/tickets/:ticketId/docs/:filename` — write a markdown doc (`.md` only)
- [x] `GET  /api/projects/:projectId/tickets/:ticketId/attachments` — list attachments
- [x] `PUT  /api/projects/:projectId/tickets/:ticketId/attachments` — update attachments list

### 2.3 Tests (TDD baseline)

- [x] `packages/server/src/__tests__/data.test.ts` — 14 unit tests for data layer
- [x] `packages/server/src/__tests__/routes.test.ts` — 24 route integration tests via Fastify `inject`
- [x] `packages/cli/src/__tests__/project.test.ts` — 9 unit tests for CLI project helpers

---

## Phase 3 — MCP Server

> Goal: Claude Code can connect and perform all ticket operations

### 3.1 MCP integration

- [x] Install `@modelcontextprotocol/sdk`
- [x] Mount MCP handler at `/mcp` in Fastify
- [x] Expose `loci://instructions` resource (contents of `LOCI.md`)

### 3.2 MCP tools

- [x] `list_projects()`
- [x] `list_tickets(project_id?, status?, assignee?)`
- [x] `get_ticket(id)` — returns ticket + all doc contents
- [x] `create_ticket(title, priority?, labels?, assignee?)`
- [x] `update_ticket(id, fields)`
- [x] `read_ticket_doc(id, filename)`
- [x] `write_ticket_doc(id, filename, content)`

### 3.3 Verification

- [x] Add Loci to local Claude Code MCP config
- [x] Test: Claude can list tickets, create a ticket, write `implementation_plan.md`

---

## Phase 4 — Web UI (Core) ✅

> Goal: Dashboard and project board working in browser

### 4.1 Frontend scaffold (`packages/web`)

- [x] Scaffold with Vite + React + TypeScript
- [x] Install Tailwind CSS (v4 via @tailwindcss/vite — shadcn deferred to Phase 5)
- [x] Install `@tanstack/react-query` for data fetching
- [x] Install `react-router-dom` for routing
- [x] Configure proxy to `localhost:3333/api` in dev mode

### 4.2 Routing

- [x] `/` → Dashboard
- [x] `/project/:id` → Project board
- [x] `/project/:id/:ticketId` → Ticket detail (Phase 5)

### 4.3 Dashboard page

- [x] Fetch all projects from `GET /api/projects`
- [x] Render project cards: name, prefix, ticket counts by status
- [x] Link to project board

### 4.4 Project board — Kanban view

- [x] Install `@dnd-kit/core` + `@dnd-kit/sortable`
- [x] Three columns: Todo / In Progress / Done
- [x] Ticket cards: ID, title, priority badge, assignee
- [x] Drag card between columns → `PATCH /api/tickets/:id` to update status

### 4.5 Project board — List view

- [x] Sortable table: ID | Title | Status | Priority | Assignee | Updated
- [x] Toggle button to switch between Kanban and List views

---

## Phase 4.6 — Single-Command Serve ✅

> Goal: `loci serve` starts everything; one terminal for dev, one command for prod

### 4.6.1 Production — server serves built web assets

- [x] Add `build` script to `packages/web` that outputs to `packages/server/public/`
- [x] Register `@fastify/static` in `packages/server` pointing at `public/` — serves `index.html` at `/`
- [x] Add catch-all `GET /*` route in server to return `index.html` (enables client-side routing)
- [x] Remove the old placeholder `GET /` handler

### 4.6.2 Dev — single root command for both servers

- [x] Add `concurrently` to root devDependencies
- [x] Add root `dev` script: `concurrently "bun run --cwd packages/server dev" "bun run --cwd packages/web dev"`
- [x] Verify: `bun run dev` at repo root starts both, Vite proxy forwards `/api` to `:3333`

### 4.6.3 Verification

- [x] `bun run dev` → open `http://localhost:5173` → dashboard loads
- [x] `bun run --cwd packages/web build && loci serve` → open `http://localhost:3333` → dashboard loads (no Vite)

---

## Phase 5 — Ticket Detail ✅

> Goal: Full ticket view with editable markdown docs and attachments

### 5.1 Ticket header

- [x] Display: ID, title, status dropdown, priority dropdown, labels, assignee, progress bar
- [x] Inline edits save via `PATCH /api/tickets/:id`

### 5.2 Document tabs

- [x] Fetch doc list from `GET /api/tickets/:id`
- [x] Auto-render a tab for each `.md` file found
- [x] Fixed tab order: Description → Design → Plan → Summary → [others] → Attachments
- [x] Install `react-markdown` + `remark-gfm` for rendering
- [x] Toggle: View mode (rendered markdown) ↔ Edit mode (textarea)
- [x] Save via `PUT /api/tickets/:id/docs/:filename`

### 5.3 Attachments tab

- [x] Display list of linked file paths
- [x] Add attachment: input a workspace-relative path
- [x] Remove attachment
- [x] Save via `PUT /api/tickets/:id/attachments`

---

## Phase 6 — Polish ✅

> Goal: Real-time feel, small UX improvements

- [x] File-watch on `.loci/` — emit SSE events when tickets change
- [x] Frontend subscribes to SSE → auto-refresh board without polling
- [x] `loci open` command — opens `localhost:3333/project/<current-project-id>` in browser
- [x] Port conflict handling in `loci serve` — detects PID via `lsof`, prints `kill <pid>` guidance, exits cleanly
- [x] Port override via `loci serve --port <n>`
- [x] Error states in UI (project not found, server offline)
- [x] Basic keyboard shortcuts: `N` = new ticket, `K/L` = toggle view

---

## Suggested Execution Order

```
Phase 1 (Foundation)
      ↓
Phase 2 (Server)       ← now you have an API to build UI against
      ↓
Phase 4 (Web UI Core)  ← visible progress, validates data model
      ↓
Phase 3 (MCP)          ← builds on same data layer as REST
      ↓
Phase 5 (Ticket Detail)
      ↓
Phase 6 (Polish)
```

---

## Definition of Done

- [ ] `loci init` → `loci serve` → open browser → see dashboard
- [ ] Create ticket via CLI, see it appear on board
- [ ] Drag ticket across Kanban columns
- [ ] Claude Code can list and update tickets via MCP
- [ ] Agent writes `implementation_plan.md`, visible in ticket detail UI
