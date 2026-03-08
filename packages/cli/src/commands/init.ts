import { Command } from 'commander'
import { existsSync, readFileSync, appendFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
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

function generateLociMd(project: Project, port = 3333): string {
  return `# Loci — Project Instructions
Project: ${project.name} | Prefix: ${project.prefix} | Server: http://localhost:${port}

## Ticket Workflow
- Before starting: \`get_ticket(<id>)\`, read \`description.md\`
- Create \`implementation_plan.md\` before coding
- Set status to \`in_progress\` when starting work
- Write \`summary.md\` when done, set status to \`done\`
- Assign yourself: \`assignee: "agent:<your-name>"\`

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
- \`todo\` | \`in_progress\` | \`done\` — any status can transition to any other freely

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

async function prompt(question: string): Promise<string> {
  process.stdout.write(question)
  for await (const line of console) {
    return line.trim()
  }
  return ''
}

async function promptValidated(question: string, validate: (v: string) => string | null): Promise<string> {
  while (true) {
    const value = await prompt(question)
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

    const name = await promptValidated('Project name: ', (v) =>
      v.length === 0 ? 'Name cannot be empty' : null
    )

    const prefix = await promptValidated('Project prefix (2–5 uppercase letters, e.g. APP): ', (v) => {
      if (!/^[A-Z]{2,5}$/.test(v)) return 'Prefix must be 2–5 uppercase letters (A-Z)'
      return null
    })

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
