import { Command } from 'commander'
import { join } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { findWorkspaceRoot, readProject, writeProject, getTicketsDir } from '../project'
import { formatId } from '@loci/shared'
import type { Ticket, TicketPriority } from '@loci/shared'

export const addCommand = new Command('add')
  .description('Create a new ticket')
  .argument('<title>', 'Ticket title')
  .option('--priority <priority>', 'Priority: low | medium | high', 'medium')
  .option('--json', 'Output as JSON')
  .action((title: string, opts: { priority: string; json?: boolean }) => {
    const root = findWorkspaceRoot()
    if (!root) {
      if (opts.json) process.stderr.write(JSON.stringify({ error: 'No Loci project found. Run `loci init` first.' }) + '\n')
      else console.error('Error: No Loci project found. Run `loci init` first.')
      process.exit(1)
    }

    const project = readProject(root)
    const id = formatId(project.prefix, project.nextId)

    project.nextId++
    writeProject(root, project)

    const ticketDir = join(getTicketsDir(root), id)
    mkdirSync(ticketDir, { recursive: true })

    const now = new Date().toISOString()
    const ticket: Ticket = {
      id,
      title,
      status: 'todo',
      priority: (opts.priority as TicketPriority) ?? 'medium',
      labels: [],
      assignee: null,
      progress: 0,
      archived: false,
      createdAt: now,
      updatedAt: now,
    }

    writeFileSync(join(ticketDir, 'ticket.json'), JSON.stringify(ticket, null, 2))
    writeFileSync(join(ticketDir, 'description.md'), `# ${title}\n\n`)
    writeFileSync(join(ticketDir, 'attachments.json'), JSON.stringify([], null, 2))

    if (opts.json) {
      console.log(JSON.stringify(ticket, null, 2))
    } else {
      console.log(`✓ Created ${id}: ${title}`)
    }
  })
