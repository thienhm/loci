# Loci — Project Instructions
Project: Loci | Prefix: LCI | Server: http://localhost:3333

## Project Guard
- Only manage tickets for **this project** (prefix: `LCI`)
- Never read or update tickets from other projects

## Architecture

Bun monorepo with four packages:

| Package          | Role                                           |
| ---------------- | ---------------------------------------------- |
| `packages/shared`| Shared types (`Ticket`, `Project`, `Registry`) and utilities (`formatId`) |
| `packages/server`| Fastify server — REST API, MCP endpoint, SSE   |
| `packages/cli`   | CLI (`loci init`, `loci serve`)                 |
| `packages/web`   | React + Vite web UI (Kanban board, ticket details) |

### Data Storage
All data lives on disk under `.loci/` in the workspace root:

```
.loci/
├── project.json          # project metadata + nextId counter
├── tickets/
│   ├── LCI-001/
│   │   ├── ticket.json   # ticket fields
│   │   ├── description.md
│   │   ├── attachments.json
│   │   └── files/        # uploaded binary files
│   └── archived/         # archived tickets moved here
│       └── LCI-002/
```

A global registry at `~/.loci/registry.json` tracks all registered projects.

### Server Endpoints
- **REST API**: `http://localhost:3333/api/...` — full CRUD for projects, tickets, docs, attachments, files
- **MCP**: `http://localhost:3333/mcp` — Streamable HTTP (POST only)
- **SSE**: `http://localhost:3333/api/projects/:projectId/events` — real-time change notifications
- **Web UI**: `http://localhost:3333` — serves built React app from `public/`

### Running

```bash
bun run dev          # starts server + web dev concurrently
bun run build        # builds all packages
bun run test         # runs cli + server tests
```

## Ticket Workflow

### Starting a Ticket
1. Call `get_ticket(<id>)` and read `description.md`
2. If the description is vague, ask the user to clarify → update `description.md` with the outcome
3. Brainstorm the approach before touching any code
4. Assign yourself: `update_ticket(id, { assignee: "agent:<your-name>" })`
5. Ask the user: **"New git branch, git worktree, or work on the current branch?"**
6. Set status to `in_progress`, create `implementation_plan.md`

### Completing a Ticket
1. Write `summary.md` describing what was done
2. Set status to `in_review`
3. Ask the user to verify the implementation
4. **Only set status to `done` when the user explicitly confirms** — never auto-close

## Document Conventions
- `description.md`         → what the ticket is, acceptance criteria (always created)
- `design.md`              → technical/UI design decisions (optional)
- `implementation_plan.md` → step-by-step plan (optional)
- `summary.md`             → post-completion summary (optional)
- `attachments.json`       → list of attached filenames (auto-created)
- `files/`                 → uploaded binary files directory (auto-created on upload)
- Any `.md` file in the ticket folder is shown as a tab in the UI

## Assignee Format
- `null`              → unassigned
- `"human"`           → project owner
- `"agent:<name>"`   → AI agent, e.g. `"agent:claude"`, `"agent:gemini"`

## Status Values
Flow: `todo` → `in_progress` → `in_review` → `done`

- `todo`        — not started
- `in_progress` — actively being worked on
- `in_review`   — implementation complete, awaiting user verification
- `done`        — verified and closed (only set on explicit user request)

## MCP Tools Available
```
list_projects()
list_tickets(project_id?, status?, assignee?, archived?)
get_ticket(id)
create_ticket(title, project_id?, priority?, labels?, assignee?)
update_ticket(id, fields)
read_ticket_doc(id, filename)
write_ticket_doc(id, filename, content)
list_attachments(id)
update_attachments(id, attachments)
list_files(id)
delete_file(id, filename)
```

## REST API Reference

### Projects
- `GET    /api/projects`                          — list all projects
- `GET    /api/projects/:projectId`               — get project metadata

### Tickets
- `GET    /api/projects/:projectId/tickets`       — list tickets (`?status=`, `?assignee=`, `?archived=`)
- `POST   /api/projects/:projectId/tickets`       — create ticket
- `GET    /api/projects/:projectId/tickets/:id`    — get ticket + docs
- `PATCH  /api/projects/:projectId/tickets/:id`    — update ticket fields

### Docs
- `GET    /api/projects/:projectId/tickets/:id/docs/:filename`  — read doc
- `PUT    /api/projects/:projectId/tickets/:id/docs/:filename`  — write doc (text/plain body)

### Attachments
- `GET    /api/projects/:projectId/tickets/:id/attachments`     — list attachments
- `PUT    /api/projects/:projectId/tickets/:id/attachments`     — update attachments list

### Files
- `GET    /api/projects/:projectId/tickets/:id/files`            — list files
- `POST   /api/projects/:projectId/tickets/:id/files`            — upload file (multipart)
- `GET    /api/projects/:projectId/tickets/:id/files/:filename`  — download file
- `DELETE /api/projects/:projectId/tickets/:id/files/:filename`  — delete file

### SSE
- `GET    /api/projects/:projectId/events`        — real-time change stream

## Ticket ID Format
`LCI-001`, `LCI-002`, ... (3-digit min, grows naturally: LCI-1000)
