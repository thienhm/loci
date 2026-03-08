import { Command } from 'commander'
import { join } from 'path'
import { mkdirSync, writeFileSync } from 'fs'
import { findWorkspaceRoot, readProject, writeProject, getTicketsDir } from '../project'
import { formatId } from '@loci/shared'
import type { Ticket } from '@loci/shared'

export const addCommand = new Command('add')
  .description('Create a new ticket')
  .argument('<title>', 'Ticket title')
  .action((title: string) => {
    const root = findWorkspaceRoot()
    if (!root) {
      console.error('Error: No Loci project found. Run `loci init` first.')
      process.exit(1)
    }

    const project = readProject(root)
    const id = formatId(project.prefix, project.nextId)

    // Atomically increment nextId
    project.nextId++
    writeProject(root, project)

    // Create ticket folder
    const ticketDir = join(getTicketsDir(root), id)
    mkdirSync(ticketDir, { recursive: true })

    const now = new Date().toISOString()
    const ticket: Ticket = {
      id,
      title,
      status: 'todo',
      priority: 'medium',
      labels: [],
      assignee: null,
      progress: 0,
      createdAt: now,
      updatedAt: now,
    }

    // Write ticket.json
    writeFileSync(join(ticketDir, 'ticket.json'), JSON.stringify(ticket, null, 2))

    // Write description.md (always created — required default doc)
    writeFileSync(join(ticketDir, 'description.md'), `# ${title}\n\n`)

    // Write attachments.json (always created)
    writeFileSync(join(ticketDir, 'attachments.json'), JSON.stringify([], null, 2))

    console.log(`✓ Created ${id}: ${title}`)
  })
