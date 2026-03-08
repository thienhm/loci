# Loci — Project Instructions
Project: Loci | Prefix: LCI | Server: http://localhost:3333

## Ticket Workflow
- Before starting: `get_ticket(<id>)`, read `description.md`
- Create `implementation_plan.md` before coding
- Set status to `in_progress` when starting work
- Write `summary.md` when done, set status to `done`
- Assign yourself: `assignee: "agent:<your-name>"`

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
- `todo` | `in_progress` | `done` — any status can transition to any other freely

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
