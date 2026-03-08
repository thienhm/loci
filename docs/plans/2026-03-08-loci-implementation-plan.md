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
- [ ] Init root `package.json` with Bun workspaces
- [ ] Create `packages/shared`, `packages/cli`, `packages/server`, `packages/web`
- [ ] Configure root `tsconfig.json` with path aliases
- [ ] Add `.gitignore`

### 1.2 Shared types (`packages/shared`)
- [ ] `Project` type — id, name, prefix, nextId, createdAt
- [ ] `Ticket` type — id, title, status, priority, labels, assignee, progress, createdAt, updatedAt
- [ ] `Registry` type — list of `{ id, name, prefix, path }`
- [ ] Status enum: `todo | in_progress | done`
- [ ] Priority enum: `low | medium | high`
- [ ] Assignee format: `"human"` (project owner, no username needed) or `"agent:<name>"` (e.g. `"agent:claude"`); `null` when unassigned
- [ ] ID generation utility: `formatId(prefix, nextId)` → `"APP-001"`
  - Implementation: `prefix + "-" + String(nextId).padStart(3, "0")`
  - No upper cap — naturally grows beyond 3 digits: APP-999 → APP-1000
- [ ] Progress field: integer 0–100, manual only, defaults to 0, never auto-calculated

### 1.3 CLI scaffold (`packages/cli`)
- [ ] Install Commander.js
- [ ] Wire up `loci` binary entry point via `package.json#bin`
- [ ] Register subcommands: `init`, `add`, `list`, `status`, `serve`

### 1.4 `loci init`
- [ ] Prompt for project name and prefix (validate: uppercase, 2–5 chars)
- [ ] Create `.loci/project.json` in current directory
- [ ] Create/update `~/.loci/registry.json` — append new project entry
- [ ] Generate `LOCI.md` in workspace root
- [ ] Detect and append pointer to `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `AGENTS.md` if they exist
- [ ] Print success message with next steps

### 1.5 `loci add`
- [ ] Walk up directory tree to find `.loci/` (or error if not found)
- [ ] Atomically increment `nextId` in `project.json`
- [ ] Create `.loci/tickets/<ID>/` folder
- [ ] Write `ticket.json` with defaults: `{ status: "todo", priority: "medium", assignee: null, labels: [], progress: 0 }`
- [ ] Write `description.md` with empty content (always created — this is the required default doc)
- [ ] Write `attachments.json` with empty array `[]`
- [ ] Print created ticket ID

> Note: `description.md` and `attachments.json` are created here (Phase 1), not in Phase 5. Phase 5 only adds the UI to view/edit them.

### 1.6 `loci list`
- [ ] Read all `ticket.json` files in `.loci/tickets/`
- [ ] Print table: ID | Title | Status | Priority | Assignee

### 1.7 `loci status <id> <status>`
- [ ] Find ticket by ID, validate status value
- [ ] Update `ticket.json` with new status + `updatedAt`
- [ ] Print confirmation

### 1.8 Bootstrap Loci on itself
- [ ] Run `loci init` in this repo (project name: "Loci", prefix: `LCI`)
- [ ] Create tickets for Phase 2, 3, 4, 5, 6 in Loci
- [ ] From this point, track all remaining progress in Loci itself

---

## Phase 2 — Server
> Goal: Fastify running with REST API, all data readable/writable via HTTP

### 2.1 Server scaffold (`packages/server`)
- [ ] Install Fastify + plugins (`@fastify/cors`, `@fastify/static`)
- [ ] Entry point: `loci serve` starts server on port 3333
- [ ] Load `~/.loci/registry.json` on startup
- [ ] Serve frontend static files from `packages/web/dist`

### 2.2 REST API routes
- [ ] `GET  /api/projects` — all projects from registry
- [ ] `GET  /api/projects/:id` — single project metadata
- [ ] `GET  /api/projects/:id/tickets` — all tickets (with optional `?status=`, `?assignee=`)
- [ ] `GET  /api/tickets/:id` — single ticket + doc list
- [ ] `POST /api/projects/:id/tickets` — create ticket
- [ ] `PATCH /api/tickets/:id` — update ticket fields
- [ ] `GET  /api/tickets/:id/docs/:filename` — read a markdown doc
- [ ] `PUT  /api/tickets/:id/docs/:filename` — write a markdown doc
- [ ] `GET  /api/tickets/:id/attachments` — list attachments
- [ ] `PUT  /api/tickets/:id/attachments` — update attachments list

---

## Phase 3 — MCP Server
> Goal: Claude Code can connect and perform all ticket operations

### 3.1 MCP integration
- [ ] Install `@modelcontextprotocol/sdk`
- [ ] Mount MCP handler at `/mcp` in Fastify
- [ ] Expose `loci://instructions` resource (contents of `LOCI.md`)

### 3.2 MCP tools
- [ ] `list_projects()`
- [ ] `list_tickets(project_id?, status?, assignee?)`
- [ ] `get_ticket(id)` — returns ticket + all doc contents
- [ ] `create_ticket(title, priority?, labels?, assignee?)`
- [ ] `update_ticket(id, fields)`
- [ ] `read_ticket_doc(id, filename)`
- [ ] `write_ticket_doc(id, filename, content)`

### 3.3 Verification
- [ ] Add Loci to local Claude Code MCP config
- [ ] Test: Claude can list tickets, create a ticket, write `implementation_plan.md`

---

## Phase 4 — Web UI (Core)
> Goal: Dashboard and project board working in browser

### 4.1 Frontend scaffold (`packages/web`)
- [ ] Scaffold with Vite + React + TypeScript
- [ ] Install Tailwind CSS + shadcn/ui
- [ ] Install `@tanstack/react-query` for data fetching
- [ ] Install `react-router-dom` for routing
- [ ] Configure proxy to `localhost:3333/api` in dev mode

### 4.2 Routing
- [ ] `/` → Dashboard
- [ ] `/project/:id` → Project board
- [ ] `/project/:id/:ticketId` → Ticket detail

### 4.3 Dashboard page
- [ ] Fetch all projects from `GET /api/projects`
- [ ] Render project cards: name, prefix, ticket counts by status
- [ ] Link to project board

### 4.4 Project board — Kanban view
- [ ] Install `@dnd-kit/core` + `@dnd-kit/sortable`
- [ ] Three columns: Todo / In Progress / Done
- [ ] Ticket cards: ID, title, priority badge, assignee
- [ ] Drag card between columns → `PATCH /api/tickets/:id` to update status

### 4.5 Project board — List view
- [ ] Sortable table: ID | Title | Status | Priority | Assignee | Updated
- [ ] Toggle button to switch between Kanban and List views

---

## Phase 5 — Ticket Detail
> Goal: Full ticket view with editable markdown docs and attachments

### 5.1 Ticket header
- [ ] Display: ID, title, status dropdown, priority dropdown, labels, assignee, progress bar
- [ ] Inline edits save via `PATCH /api/tickets/:id`

### 5.2 Document tabs
- [ ] Fetch doc list from `GET /api/tickets/:id`
- [ ] Auto-render a tab for each `.md` file found
- [ ] Fixed tab order: Description → Design → Plan → Summary → [others] → Attachments
- [ ] Install `react-markdown` + `remark-gfm` for rendering
- [ ] Toggle: View mode (rendered markdown) ↔ Edit mode (textarea)
- [ ] Save via `PUT /api/tickets/:id/docs/:filename`

### 5.3 Attachments tab
- [ ] Display list of linked file paths
- [ ] Add attachment: input a workspace-relative path
- [ ] Remove attachment
- [ ] Save via `PUT /api/tickets/:id/attachments`

---

## Phase 6 — Polish
> Goal: Real-time feel, small UX improvements

- [ ] File-watch on `.loci/` — emit SSE events when tickets change
- [ ] Frontend subscribes to SSE → auto-refresh board without polling
- [ ] `loci open` command — opens `localhost:3333/project/<current-project-id>` in browser
- [ ] Port conflict handling in `loci serve` (configurable via `--port`)
- [ ] Error states in UI (project not found, server offline)
- [ ] Basic keyboard shortcuts: `N` = new ticket, `K/L` = toggle view

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
