---
name: loci
description: Use when working with Loci tickets — starting, updating, and completing tickets via the loci CLI. Covers workflow, CLI commands, doc conventions, and assignee/status formats.
---

# Loci

Use the `loci` CLI to manage tickets. The server does **not** need to be running — the CLI reads directly from disk.

## Step 1: Discover the project

```bash
loci list --json
```

This reveals the project prefix and all tickets. Use the prefix to confirm you are working in the right project.

## Step 2: Ticket Workflow

### Starting a ticket

1. Read the ticket: `loci get <id> --json`
2. Read `description.md`: `loci doc read <id> description.md --json`
3. If the description is vague, clarify with the user and update it: `loci doc write <id> description.md --content "<content>"`
4. Assign yourself and set status:
   ```bash
   loci patch <id> --assignee "agent:claude" --json
   loci status <id> in_progress --json
   ```
5. Ask the user if they want a new branch or to work on the current branch.
6. Use the `superpowers:using-superpowers` skill to begin implementation.
7. Save generated documents to the ticket folder: `loci doc write <id> <filename>.md --content "<content>"`

### Completing a ticket

1. Write a summary: `loci doc write <id> summary.md --content "<content>"`
2. Set progress to 100: `loci patch <id> --progress 100 --json`
3. Set status to in_review: `loci status <id> in_review --json`
4. Ask the user to verify the implementation.
5. **Only set status to `done` when the user explicitly confirms** — never auto-close.

## CLI Reference

| Operation | Command |
|---|---|
| List tickets | `loci list --json` |
| Get ticket + all docs | `loci get <id> --json` |
| Create ticket | `loci add "title" [--priority low\|medium\|high] --json` |
| Update status | `loci status <id> <status> --json` |
| Update assignee / progress / priority / labels | `loci patch <id> [--assignee <value>] [--progress <0-100>] [--priority <value>] [--labels <comma-list>] --json` |
| Read a doc file | `loci doc read <id> <filename> --json` |
| Write a doc file | `loci doc write <id> <filename> --content "<content>"` |
| List attachments | `loci attachments <id> --json` |

Set assignee to null (unassigned): `loci patch <id> --assignee null`

## Status Values

Flow: `todo` → `in_progress` → `in_review` → `done`

| Status | Meaning |
|---|---|
| `todo` | Not started |
| `in_progress` | Actively being worked on |
| `in_review` | Implementation complete, awaiting user verification |
| `done` | Verified and closed — only set on explicit user confirmation |

## Assignee Format

| Value | Meaning |
|---|---|
| `null` | Unassigned |
| `"human"` | Project owner |
| `"agent:claude"` | Claude AI agent |
| `"agent:<name>"` | Any named AI agent |

## Document Conventions

| File | Purpose |
|---|---|
| `description.md` | What the ticket is + acceptance criteria (always created) |
| `design.md` | Technical or UI design decisions (optional) |
| `implementation_plan.md` | Step-by-step plan (optional) |
| `summary.md` | Post-completion summary (write before setting `in_review`) |
| `attachments.json` | List of attached filenames (auto-managed) |

Any `.md` file in the ticket folder appears as a tab in the web UI.

## Priority Values

`low` | `medium` (default) | `high`

## Progress

Manual only — never auto-calculated. Range: `0–100`.
