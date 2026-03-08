# Loci — Design Document
**Date:** 2026-03-08
**Status:** Approved
**Related docs:**
- UI Design & Wireframes: `docs/plans/2026-03-08-loci-ui-design.md`
- Implementation Plan: `docs/plans/2026-03-08-loci-implementation-plan.md`
- Design System: `docs/design-system/loci/MASTER.md`

---

## Summary

Loci is a local-first ticket management tool inspired by Jira, built for solo developers who want full control over their project tracking without cloud dependencies. AI agents (Claude Code, Antigravity) can connect natively via MCP to read and write tickets.

---

## Key Decisions

| Topic | Decision |
|---|---|
| User | Solo developer |
| Project registration | `loci init` in workspace folder |
| Interaction | CLI (minimal) + Browser UI |
| Ticket model | Status, priority, labels, assignee |
| Agent integration | MCP server only |
| Storage | JSON files + Markdown |
| UI views | Kanban board + List/table (toggleable) |
| CLI commands | `init`, `add`, `list`, `status`, `serve` |
| Terminology | "ticket" / "issue" (not "task") |
| Ticket ID format | `<PREFIX>-001`, `<PREFIX>-002`, ... (3-digit min, no upper cap) |
| Assignee format | `"human"` (project owner, solo dev) or `"agent:<name>"` (e.g. `"agent:claude"`) |
| Status transitions | Any status → any status allowed (no restrictions in v1) |
| Default server port | `3333` — exits with clear error if port taken; override with `--port` flag (Phase 6) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        LOCI SYSTEM                          │
│                                                             │
│  ┌──────────────┐     ┌─────────────────────────────────┐  │
│  │  CLI (loci)  │     │        loci serve               │  │
│  │              │     │                                 │  │
│  │ init         │     │  ┌─────────┐  ┌─────────────┐  │  │
│  │ add          │     │  │REST API │  │ MCP Server  │  │  │
│  │ list         │     │  │:3333/api│  │  :3333/mcp  │  │  │
│  │ status       │     │  └────┬────┘  └──────┬──────┘  │  │
│  └──────┬───────┘     │       │               │         │  │
│         │             │  ┌────▼───────────────▼──────┐  │  │
│         │             │  │       Data Layer          │  │  │
│         │             │  │  ~/.loci/registry.json    │  │  │
│         │             │  │  <workspace>/.loci/       │  │  │
│         └─────────────┼──►  project.json             │  │  │
│                       │  │  tickets/<ID>/            │  │  │
│                       │  │    ticket.json            │  │  │
│                       │  │    description.md         │  │  │
│                       │  │    attachments.json       │  │  │
│                       │  │    [design.md]            │  │  │
│                       │  │    [implementation_plan]  │  │  │
│                       │  │    [summary.md]           │  │  │
│                       │  └───────────────────────────┘  │  │
│                       └─────────────────────────────────┘  │
│                                                             │
│  ┌──────────────────┐     ┌──────────────────────────────┐ │
│  │  Browser UI      │     │     AI Agents                │ │
│  │  :3333           │     │                              │ │
│  │                  │     │  ┌────────────┐  ┌────────┐  │ │
│  │  Dashboard       │     │  │ Claude Code│  │Antigrav│  │ │
│  │  Project Board   │     │  └─────┬──────┘  └───┬────┘  │ │
│  │  Ticket Detail   │     │        └──────┬───────┘       │ │
│  └────────┬─────────┘     └───────────────┼───────────────┘ │
│           │                               │                 │
│           └───────────────────────────────┘                 │
│                    via REST / MCP                           │
└─────────────────────────────────────────────────────────────┘
```

---

## User Flow

```
  USER ONBOARDING
  ───────────────
  cd ~/Workspace/my-app
         │
         ▼
  ┌─────────────┐
  │ loci init   │──► prompts: Project name, Prefix (e.g. "APP")
  └─────────────┘
         │
         ▼
  Creates:  .loci/project.json       (local project config)
            ~/.loci/registry.json    (global project registry)
         │
         ▼
  ┌──────────────┐
  │ loci serve   │──► starts server at localhost:3333
  └──────────────┘    (run once, keep in background)


  DAILY WORKFLOW — HUMAN
  ──────────────────────
  loci add "Fix login bug"
         │
         ▼
  Creates:  .loci/tickets/APP-001/
              ticket.json        ← status: todo, priority: medium
              description.md     ← empty, ready to fill
              attachments.json   ← []
         │
         ▼
  Open browser → localhost:3333
         │
         ├── Dashboard: all projects overview
         │
         └── Project Board (Kanban / List toggle)
                │
                ▼
         Click ticket → Ticket Detail
                │
                ├── [ Description ] tab  ← edit markdown
                ├── [ Design ] tab       ← auto-shown if exists
                ├── [ Plan ] tab         ← auto-shown if exists
                ├── [ Summary ] tab      ← auto-shown if exists
                └── [ Attachments ] tab  ← link workspace files


  DAILY WORKFLOW — AI AGENT
  ─────────────────────────
  Claude Code connects via MCP config:
  { "loci": { "url": "http://localhost:3333/mcp" } }
         │
         ▼
  Available MCP tools:
  ┌──────────────────────────────────────────────────────────┐
  │ list_projects()                                          │
  │ list_tickets(project_id?, status?, assignee?)            │
  │ get_ticket(id)                                           │
  │ create_ticket(title, priority?, labels?, assignee?)      │
  │ update_ticket(id, fields)                                │
  │ read_ticket_doc(id, filename)                            │
  │ write_ticket_doc(id, filename, content)                  │
  └──────────────────────────────────────────────────────────┘
         │
         ▼
  Agent flow example:
  1. list_tickets(assignee: "agent:claude", status: "todo")
  2. get_ticket("APP-001")
  3. read_ticket_doc("APP-001", "description.md")   ← read task context
  4. write_ticket_doc("APP-001", "implementation_plan.md", "...plan content...")
  5. update_ticket("APP-001", { status: "in_progress" })
  6. ... does the work ...
  7. write_ticket_doc("APP-001", "summary.md", "...summary content...")
  8. update_ticket("APP-001", { status: "done" })


  TICKET ID GENERATION
  ────────────────────
  project.json: { "prefix": "APP", "nextId": 1 }
         │
  loci add ──► ID = "APP-001", nextId becomes 2
  loci add ──► ID = "APP-002", nextId becomes 3
         │
  Format: <PREFIX>-<zero-padded to 3 digits minimum, no upper cap>
  Rule: String(nextId).padStart(3, "0") — yields 001..999, then 1000, 1001, etc.
  Examples: APP-001, APP-042, APP-999, APP-1000, APP-9999
```

---

## Data Structures

### `~/.loci/registry.json`
```json
{
  "projects": [
    {
      "id": "proj-uuid",
      "name": "My App",
      "prefix": "APP",
      "path": "/Users/you/Workspace/my-app"
    }
  ]
}
```

### `.loci/project.json`
```json
{
  "id": "proj-uuid",
  "name": "My App",
  "prefix": "APP",
  "nextId": 3,
  "createdAt": "2026-03-08T00:00:00Z"
}
```

### `.loci/tickets/APP-001/ticket.json`
```json
{
  "id": "APP-001",
  "title": "Fix login bug",
  "status": "in_progress",
  "priority": "high",
  "labels": ["bug"],
  "assignee": "agent:claude",
  "progress": 40,
  "createdAt": "2026-03-08T00:00:00Z",
  "updatedAt": "2026-03-08T01:00:00Z"
}
```

### `.loci/tickets/APP-001/attachments.json`
```json
["docs/specs/auth-flow.md", "designs/login-mockup.png"]
```

---

## Ticket Document Tabs (UI)

| File | Tab Name | Created By | When |
|---|---|---|---|
| `description.md` | Description | Human / Agent | Always (on ticket create) |
| `design.md` | Design | Human / Agent | Optional |
| `implementation_plan.md` | Plan | Human / Agent | Optional |
| `summary.md` | Summary | Human / Agent | Optional |
| `*.md` (any other) | Filename | Human / Agent | Optional |
| `attachments.json` | Attachments | Human / Agent | Always (on ticket create) |

All tabs are shown only when the file exists. Any `.md` file placed in the ticket folder is automatically picked up as a tab.

---

## Browser UI Structure

```
localhost:3333/                      → Dashboard (all projects)
localhost:3333/project/<id>          → Project board (Kanban + List)
localhost:3333/project/<id>/<ticket> → Ticket detail
```

### Dashboard
- Cards per project: name, prefix, open ticket count, in-progress count
- Quick "open board" link per project

### Project Board
- Toggle: Kanban view | List view
- Kanban: columns = Todo / In Progress / Done, drag-and-drop cards
- List: sortable table by priority, status, assignee, date

### Ticket Detail
- Header: ID, title, status, priority, labels, assignee, progress bar
- Tabs: document files (see above)
- Attachments: linked workspace files with relative paths

---

## Tech Stack (Recommended)

| Layer | Choice | Reason |
|---|---|---|
| Runtime | Bun | Fast startup, native TypeScript, built-in package manager |
| CLI | Commander.js | Battle-tested, simple API |
| Server | Fastify | Lightweight, fast, plugin-based |
| MCP | `@modelcontextprotocol/sdk` | Official SDK |
| Frontend | React + Vite | Fast build, simple setup |
| UI components | shadcn/ui + Tailwind | Clean, accessible, no overengineering |
| Kanban | `@dnd-kit` | Lightweight drag-and-drop, actively maintained |
| Markdown rendering | `react-markdown` | Simple, well-maintained |

---

## AI Agent Integration

### How Agents Know How to Work with Loci

Two complementary mechanisms deliver context to AI agents:

#### 1. `LOCI.md` — Single Source of Truth
`loci init` generates a `LOCI.md` in the workspace root containing full Loci conventions, ticket schema, and workflow instructions. This file is agent-agnostic — any AI tool that reads workspace files benefits from it.

```markdown
# Loci — Project Instructions
Project: My App | Prefix: APP | Server: localhost:3333

## Ticket Workflow
- Before starting: get_ticket(<id>), read description.md
- Create implementation_plan.md before coding
- Set status to in_progress when starting work
- Write summary.md when done, set status to done
- Assign yourself: assignee: "agent:claude"

## Document Conventions
- description.md  → what the ticket is, acceptance criteria
- design.md       → technical/UI design decisions
- implementation_plan.md → step-by-step plan
- summary.md      → post-completion summary

## MCP Tools Available
list_projects, list_tickets, get_ticket, create_ticket, update_ticket
read_ticket_doc, write_ticket_doc
```

#### 2. Pointer in `CLAUDE.md` / `GEMINI.md`
`loci init` detects existing AI config files and appends a small reference block — keeping them clean while pointing agents to `LOCI.md`:

```markdown
## Loci Task Management
See LOCI.md for full instructions on working with this project's tickets.
MCP server: localhost:3333/mcp
```

Supported files: `CLAUDE.md`, `GEMINI.md`, `.cursorrules`, `AGENTS.md`

#### 3. MCP Resource (runtime)
Loci also exposes a `loci://instructions` MCP resource that agents can read at session start — useful for agents that connect via MCP but don't read workspace files. The resource serves the contents of the workspace's `LOCI.md` file verbatim.

### Agent Flow (full example)

```
  Agent receives task → read LOCI.md / loci://instructions
         │
         ▼
  list_tickets(assignee: "agent:claude", status: "todo")
         │
         ▼
  get_ticket("APP-001")  ←  reads ticket.json + description.md
         │
         ▼
  write_ticket_doc("APP-001", "implementation_plan.md", "...")
  update_ticket("APP-001", status: "in_progress")
         │
         ▼
  ... does the work ...
         │
         ▼
  write_ticket_doc("APP-001", "summary.md", "...")
  update_ticket("APP-001", status: "done")
```

### MCP Tools (full list)

| Tool | Description |
|---|---|
| `list_projects()` | All registered projects |
| `list_tickets(project_id?, status?, assignee?)` | Filter tickets |
| `get_ticket(id)` | Full ticket + all doc contents |
| `create_ticket(title, priority?, labels?, assignee?)` | New ticket |
| `update_ticket(id, fields)` | Update any ticket fields |
| `read_ticket_doc(id, filename)` | Read a specific markdown doc |
| `write_ticket_doc(id, filename, content)` | Write/create a markdown doc |

---

## Data Consistency Rules

### Registry vs Local Project
- `~/.loci/registry.json` and `.loci/project.json` are the two sources of truth
- If `.loci/` is deleted but registry entry remains → entry is stale; `loci init` in the same folder re-creates `.loci/` and updates the existing registry entry (no duplicate)
- If registry entry is missing but `.loci/project.json` exists → `loci init` re-registers it
- No auto-cleanup of stale registry entries in v1; stale entries are harmless (server skips missing paths)

### Assignee Field
- `"human"` — assigned to the project owner (this is a solo-developer tool; no user accounts exist)
- `"agent:<name>"` — assigned to a named AI agent, e.g. `"agent:claude"`, `"agent:gemini"`
- Unassigned tickets use `null`

### Status Transitions
- Any status can transition to any other status freely: `todo → done`, `done → todo`, etc.
- No enforced state machine in v1 — full flexibility for human and agent workflows

### Progress Field
- Integer 0–100 representing percentage completion
- Purely manual — set by human or agent via `update_ticket`; never auto-calculated
- Defaults to `0` on ticket creation

---

## Data Consistency Rules

### Registry vs Local Project
- `~/.loci/registry.json` and `.loci/project.json` are the two sources of truth
- If `.loci/` is deleted but registry entry remains → entry is stale; `loci init` in the same folder re-creates `.loci/` and updates the existing registry entry (no duplicate created)
- If registry entry is missing but `.loci/project.json` exists → `loci init` re-registers it
- No auto-cleanup of stale registry entries in v1; server skips paths that no longer exist on disk

### Assignee Field
- `"human"` — assigned to the project owner (solo-developer tool; no user accounts)
- `"agent:<name>"` — assigned to a named AI agent, e.g. `"agent:claude"`, `"agent:gemini"`
- Unassigned tickets use `null`

### Status Transitions
- Any status can transition to any other freely: `todo → done`, `done → todo`, etc.
- No enforced state machine in v1 — full flexibility for both human and agent workflows

### Progress Field
- Integer 0–100 representing percentage completion
- Purely manual — set by human or agent via `update_ticket`; never auto-calculated
- Defaults to `0` on ticket creation

### Port Configuration
- Default port: `3333`
- If port is already in use: detect the conflicting PID via `lsof`, print it, and guide the user with the exact `kill <pid>` command to run; then exit with a non-zero code
- Override: `loci serve --port <n>` (implemented in Phase 6)
- `LOCI.md` hardcodes `localhost:3333`; if a custom port is used, regenerate with `loci init --port <n>`

---

## Out of Scope (v1)

- Multi-user / shared server
- Authentication
- Cloud sync
- Comments / activity feed
- Notifications
- Sprint / milestone tracking
- Time tracking
- Labels management UI (labels can be set on tickets but there is no dedicated labels page or filter sidebar)
- Members / team management (solo dev tool — assignee is either "human" or "agent:<name>", no user accounts)
