import { Command } from 'commander'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { findWorkspaceRoot, getTicketsDir } from '../project'
import type { Ticket, TicketStatus } from '@loci/shared'

const VALID_STATUSES: TicketStatus[] = ['todo', 'in_progress', 'in_review', 'done']

export const statusCommand = new Command('status')
  .description('Update a ticket status')
  .argument('<id>', 'Ticket ID (e.g. APP-001)')
  .argument('<status>', 'New status: todo | in_progress | in_review | done')
  .option('--json', 'Output as JSON')
  .action((id: string, newStatus: string, opts: { json?: boolean }) => {
    if (!VALID_STATUSES.includes(newStatus as TicketStatus)) {
      const msg = `Invalid status "${newStatus}". Must be one of: ${VALID_STATUSES.join(', ')}`
      if (opts.json) process.stderr.write(JSON.stringify({ error: msg }) + '\n')
      else console.error(`Error: ${msg}`)
      process.exit(1)
    }

    const root = findWorkspaceRoot()
    if (!root) {
      if (opts.json) process.stderr.write(JSON.stringify({ error: 'No Loci project found. Run `loci init` first.' }) + '\n')
      else console.error('Error: No Loci project found. Run `loci init` first.')
      process.exit(1)
    }

    const ticketPath = join(getTicketsDir(root), id, 'ticket.json')
    if (!existsSync(ticketPath)) {
      const msg = `Ticket "${id}" not found.`
      if (opts.json) process.stderr.write(JSON.stringify({ error: msg }) + '\n')
      else console.error(`Error: ${msg}`)
      process.exit(1)
    }

    const ticket: Ticket = JSON.parse(readFileSync(ticketPath, 'utf8'))
    const oldStatus = ticket.status
    ticket.status = newStatus as TicketStatus
    ticket.updatedAt = new Date().toISOString()
    writeFileSync(ticketPath, JSON.stringify(ticket, null, 2))

    if (opts.json) {
      console.log(JSON.stringify(ticket, null, 2))
    } else {
      console.log(`✓ ${id}: ${oldStatus} → ${newStatus}`)
    }
  })
