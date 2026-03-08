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
  .action((id: string, newStatus: string) => {
    if (!VALID_STATUSES.includes(newStatus as TicketStatus)) {
      console.error(`Error: Invalid status "${newStatus}". Must be one of: ${VALID_STATUSES.join(', ')}`)
      process.exit(1)
    }

    const root = findWorkspaceRoot()
    if (!root) {
      console.error('Error: No Loci project found. Run `loci init` first.')
      process.exit(1)
    }

    const ticketPath = join(getTicketsDir(root), id, 'ticket.json')
    if (!existsSync(ticketPath)) {
      console.error(`Error: Ticket "${id}" not found.`)
      process.exit(1)
    }

    const ticket: Ticket = JSON.parse(readFileSync(ticketPath, 'utf8'))
    const oldStatus = ticket.status
    ticket.status = newStatus as TicketStatus
    ticket.updatedAt = new Date().toISOString()

    writeFileSync(ticketPath, JSON.stringify(ticket, null, 2))
    console.log(`✓ ${id}: ${oldStatus} → ${newStatus}`)
  })
