# Loci — Project Instructions
Project: Loci | Prefix: LCI | Server: http://localhost:3333

## Project Guard
- Only manage tickets for **this project** (prefix: `LCI`)
- Never read or update tickets from other projects

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
list_tickets(project_id?, status?, assignee?)
get_ticket(id)
create_ticket(title, priority?, labels?, assignee?)
update_ticket(id, fields)
read_ticket_doc(id, filename)
write_ticket_doc(id, filename, content)
```

## Ticket ID Format
`LCI-001`, `LCI-002`, ... (3-digit min, grows naturally: LCI-1000)
