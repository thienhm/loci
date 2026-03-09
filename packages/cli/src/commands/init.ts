import { Command } from 'commander'
import { existsSync, readFileSync, appendFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { createInterface } from 'readline/promises'
import {
  findWorkspaceRoot,
  getLociDir,
  getProjectJsonPath,
  readRegistry,
  writeRegistry,
  writeProject,
} from '../project'
import type { Project, RegistryEntry } from '@loci/shared'

const AI_CONFIG_FILES = ['CLAUDE.md', 'GEMINI.md', '.cursorrules', 'AGENTS.md']

const LOCI_POINTER_BLOCK = (port = 3333) => `
## Loci Task Management
See LOCI.md for full instructions on working with this project's tickets.
MCP server: http://localhost:${port}/mcp
`

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

async function promptValidated(
  rl: Awaited<ReturnType<typeof createInterface>>,
  question: string,
  validate: (v: string) => string | null
): Promise<string> {
  while (true) {
    const value = (await rl.question(question)).trim()
    const error = validate(value)
    if (!error) return value
    console.error(`  Error: ${error}`)
  }
}

export const initCommand = new Command('init')
  .description('Initialize a Loci project in the current directory')
  .action(async () => {
    const cwd = process.cwd()

    // Check if already initialized
    if (existsSync(join(cwd, '.loci'))) {
      console.log('✓ Project already initialized in this directory.')
      console.log('  Run `loci serve` to start the server.')
      return
    }

    console.log('Initializing Loci project...\n')

    const rl = createInterface({ input: process.stdin, output: process.stdout })

    const name = await promptValidated(rl, 'Project name: ', (v) =>
      v.length === 0 ? 'Name cannot be empty' : null
    )

    const prefix = await promptValidated(rl, 'Project prefix (2–5 uppercase letters, e.g. APP): ', (v) => {
      if (!/^[A-Z]{2,5}$/.test(v)) return 'Prefix must be 2–5 uppercase letters (A-Z)'
      return null
    })

    rl.close()

    // Create project
    const project: Project = {
      id: randomUUID(),
      name,
      prefix,
      nextId: 1,
      createdAt: new Date().toISOString(),
    }

    // Write .loci/project.json
    const lociDir = getLociDir(cwd)
    Bun.spawnSync(['mkdir', '-p', join(lociDir, 'tickets')])
    writeProject(cwd, project)

    // Update ~/.loci/registry.json
    const registry = readRegistry()
    const existing = registry.projects.findIndex((p) => p.path === cwd)
    const entry: RegistryEntry = { id: project.id, name, prefix, path: cwd }
    if (existing >= 0) {
      registry.projects[existing] = entry
    } else {
      registry.projects.push(entry)
    }
    writeRegistry(registry)

    // Generate LOCI.md
    const lociMdPath = join(cwd, 'LOCI.md')
    await Bun.write(lociMdPath, generateLociMd(project))

    // Append pointer to any existing AI config files
    for (const file of AI_CONFIG_FILES) {
      const filePath = join(cwd, file)
      if (existsSync(filePath)) {
        const content = readFileSync(filePath, 'utf8')
        if (!content.includes('Loci Task Management')) {
          appendFileSync(filePath, LOCI_POINTER_BLOCK())
          console.log(`  ✓ Added Loci reference to ${file}`)
        }
      }
    }

    console.log(`
✓ Project initialized!

  Name:   ${name}
  Prefix: ${prefix}
  Dir:    .loci/

Next steps:
  loci add "My first ticket"   — create a ticket
  loci serve                   — start the UI + API server
`)
  })
