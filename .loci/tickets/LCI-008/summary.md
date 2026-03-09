# Summary — LCI-008: Update ticket workflow in LOCI.md

## What was done

### 1. Expanded `generateLociMd` template (`packages/cli/src/commands/init.ts`)
- Exported the function so it can be reused by the new `update` command
- Added **Project Guard** section: only manage tickets for the current project, never touch other projects
- Expanded **Ticket Workflow** into two sub-sections:
  - **Starting**: clarify description if vague → brainstorm → assign self → ask about branch strategy → set `in_progress`
  - **Completing**: write summary → set `in_review` → ask user to verify → only set `done` on explicit user confirmation
- Updated **Status Values** to show the full flow: `todo → in_progress → in_review → done` with descriptions for each state

### 2. Added `loci update` command (`packages/cli/src/commands/update.ts`)
- New CLI command that regenerates `LOCI.md` from current project data
- Supports `--port` option (defaults to 3333)
- Errors clearly if no Loci project is found

### 3. Registered `updateCommand` in `packages/cli/src/index.ts`

### 4. Regenerated workspace `LOCI.md`
- Ran `loci update` to apply the new template to this project
