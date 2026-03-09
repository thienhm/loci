# LCI-008: Update Ticket Workflow in LOCI.md — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Expand the LOCI.md template with a richer ticket workflow, add `in_review` status flow, and add a `loci update` CLI command that regenerates LOCI.md for existing projects.

**Architecture:** `generateLociMd` in `init.ts` gets updated content and exported; a new `update.ts` command imports and uses it; `index.ts` registers the command; the workspace LOCI.md is regenerated.

**Tech Stack:** TypeScript, Bun, Commander.js

---

### Task 1: Update `generateLociMd` with expanded workflow content

**Files:**
- Modify: `packages/cli/src/commands/init.ts`

The function needs to be exported (for reuse by the update command) and its content updated to reflect:
- Status flow with `in_review`
- Expanded ticket workflow (describe → brainstorm → assign → branch decision → implement → in_review → done on user request)
- Project guard (only touch current project's tickets)

**Step 1: Export `generateLociMd` and update its content**

Replace the `generateLociMd` function in `packages/cli/src/commands/init.ts` with:

```typescript
export function generateLociMd(project: Project, port = 3333): string {
  return `# Loci — Project Instructions
Project: ${project.name} | Prefix: ${project.prefix} | Server: http://localhost:${port}

## Project Guard
- Only manage tickets for **this project** (prefix: \`${project.prefix}\`)
- Never read or update tickets from other projects

## Ticket Workflow

### Starting a Ticket
1. Call \`get_ticket(<id>)\` and read \`description.md\`
2. If the description is vague, ask the user to clarify → update \`description.md\` with the outcome
3. Brainstorm the approach before touching any code
4. Assign yourself: \`update_ticket(id, { assignee: "agent:<your-name>" })\`
5. Ask the user: **"New git branch, git worktree, or work on the current branch?"**
6. Set status to \`in_progress\`, create \`implementation_plan.md\`

### Completing a Ticket
1. Write \`summary.md\` describing what was done
2. Set status to \`in_review\`
3. Ask the user to verify the implementation
4. **Only set status to \`done\` when the user explicitly confirms** — never auto-close

## Document Conventions
- \`description.md\`         → what the ticket is, acceptance criteria (always created)
- \`design.md\`              → technical/UI design decisions (optional)
- \`implementation_plan.md\` → step-by-step plan (optional)
- \`summary.md\`             → post-completion summary (optional)
- Any \`.md\` file in the ticket folder is shown as a tab in the UI

## Assignee Format
- \`null\`              → unassigned
- \`"human"\`           → project owner
- \`"agent:<name>"\`   → AI agent, e.g. \`"agent:claude"\`, \`"agent:gemini"\`

## Status Values
Flow: \`todo\` → \`in_progress\` → \`in_review\` → \`done\`

- \`todo\`        — not started
- \`in_progress\` — actively being worked on
- \`in_review\`   — implementation complete, awaiting user verification
- \`done\`        — verified and closed (only set on explicit user request)

## MCP Tools Available
\`\`\`
list_projects()
list_tickets(project_id?, status?, assignee?)
get_ticket(id)
create_ticket(title, priority?, labels?, assignee?)
update_ticket(id, fields)
read_ticket_doc(id, filename)
write_ticket_doc(id, filename, content)
\`\`\`

## Ticket ID Format
\`${project.prefix}-001\`, \`${project.prefix}-002\`, ... (3-digit min, grows naturally: ${project.prefix}-1000)
`
}
```

**Step 2: Verify the file compiles**

```bash
cd /Users/thienhuynh/Workspace/loci
bun run --cwd packages/cli tsc --noEmit
```
Expected: No errors.

**Step 3: Commit**

```bash
git add packages/cli/src/commands/init.ts
git commit -m "feat(LCI-008): expand generateLociMd workflow — status flow, project guard, branch prompt"
```

---

### Task 2: Create `loci update` command

**Files:**
- Create: `packages/cli/src/commands/update.ts`

This command regenerates LOCI.md from the current project data. No prompts needed.

**Step 1: Create the command file**

`loci update` only needs to regenerate LOCI.md. The MCP server serves the `loci-instructions` resource by reading LOCI.md at runtime, so no separate MCP update is needed.

```typescript
// packages/cli/src/commands/update.ts
import { Command } from 'commander'
import { join } from 'path'
import { findWorkspaceRoot, readProject } from '../project'
import { generateLociMd } from './init'

export const updateCommand = new Command('update')
  .description('Regenerate LOCI.md with the latest workflow instructions')
  .option('-p, --port <number>', 'port the server runs on', '3333')
  .action(async (opts) => {
    const cwd = process.cwd()
    const workspaceRoot = findWorkspaceRoot(cwd)

    if (!workspaceRoot) {
      console.error('Error: No Loci project found. Run `loci init` first.')
      process.exit(1)
    }

    const project = readProject(workspaceRoot)
    const port = parseInt(opts.port, 10)
    const lociMdPath = join(workspaceRoot, 'LOCI.md')

    await Bun.write(lociMdPath, generateLociMd(project, port))
    console.log(`✓ LOCI.md updated for project "${project.name}" (${project.prefix})`)
  })
```

**Step 2: Verify it compiles**

```bash
bun run --cwd packages/cli tsc --noEmit
```
Expected: No errors.

**Step 3: Commit**

```bash
git add packages/cli/src/commands/update.ts
git commit -m "feat(LCI-008): add loci update command to regenerate LOCI.md"
```

---

### Task 3: Register `updateCommand` in the CLI entry point

**Files:**
- Modify: `packages/cli/src/index.ts`

**Step 1: Add the import and register the command**

Add to the imports:
```typescript
import { updateCommand } from './commands/update'
```

Add after the existing `program.addCommand(...)` calls:
```typescript
program.addCommand(updateCommand)
```

**Step 2: Verify**

```bash
bun run --cwd packages/cli tsc --noEmit
```

Run `loci --help` to confirm the new command appears:
```bash
bun packages/cli/src/index.ts --help
```
Expected output includes: `update   Regenerate LOCI.md with the latest workflow instructions`

**Step 3: Commit**

```bash
git add packages/cli/src/index.ts
git commit -m "feat(LCI-008): register loci update in CLI"
```

---

### Task 4: Regenerate the workspace LOCI.md using `loci update`

**Files:**
- Modify: `LOCI.md` (workspace root — the loci project's own LOCI.md)

**Step 1: Run `loci update`**

```bash
cd /Users/thienhuynh/Workspace/loci
bun packages/cli/src/index.ts update
```
Expected: `✓ LOCI.md updated for project "Loci" (LCI)`

**Step 2: Verify LOCI.md content**

Open `LOCI.md` and confirm it contains:
- "Project Guard" section
- Expanded "Ticket Workflow" section with branch prompt step
- Status flow: `todo → in_progress → in_review → done`

**Step 3: Commit**

```bash
git add LOCI.md
git commit -m "chore(LCI-008): regenerate LOCI.md with updated workflow instructions"
```

---

### Task 5: Move ticket to `in_review` and write summary

**Step 1: Write summary doc**

Use `write_ticket_doc` MCP tool to write `summary.md` for LCI-008.

**Step 2: Update ticket status**

```
update_ticket("LCI-008", { status: "in_review" })
```

**Step 3: Ask user to verify**

Present the changes for user review before any `done` transition.
