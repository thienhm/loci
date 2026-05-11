import { Command } from 'commander'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { findWorkspaceRoot, getTicketsDir } from '../project'
import type { Ticket, TicketPriority, Assignee } from '@loci/shared'

interface PatchFields {
  assignee?: Assignee
  progress?: number
  priority?: TicketPriority
  labels?: string[]
}

export function patchTicket(id: string, fields: PatchFields, root: string): Ticket {
  const ticketPath = join(getTicketsDir(root), id, 'ticket.json')
  if (!existsSync(ticketPath)) {
    throw new Error(`Ticket "${id}" not found`)
  }
  const ticket: Ticket = JSON.parse(readFileSync(ticketPath, 'utf8'))
  if (fields.assignee !== undefined) ticket.assignee = fields.assignee
  if (fields.progress !== undefined) ticket.progress = fields.progress
  if (fields.priority !== undefined) ticket.priority = fields.priority
  if (fields.labels !== undefined) ticket.labels = fields.labels
  ticket.updatedAt = new Date().toISOString()
  writeFileSync(ticketPath, JSON.stringify(ticket, null, 2))
  return ticket
}

export const patchCommand = new Command('patch')
  .description('Update ticket fields (assignee, progress, priority, labels)')
  .argument('<id>', 'Ticket ID (e.g. LCI-001)')
  .option('--assignee <assignee>', 'Set assignee (e.g. "agent:claude", "human", "null")')
  .option('--progress <number>', 'Set progress 0-100', parseInt)
  .option('--priority <priority>', 'Set priority: low | medium | high')
  .option('--labels <labels>', 'Comma-separated labels (e.g. "bug,cli")')
  .option('--json', 'Output as JSON')
  .action((id: string, opts: { assignee?: string; progress?: number; priority?: string; labels?: string; json?: boolean }) => {
    const root = findWorkspaceRoot()
    if (!root) {
      if (opts.json) process.stderr.write(JSON.stringify({ error: 'No Loci project found. Run `loci init` first.' }) + '\n')
      else console.error('Error: No Loci project found. Run `loci init` first.')
      process.exit(1)
    }
    const fields: PatchFields = {}
    if (opts.assignee !== undefined) fields.assignee = opts.assignee === 'null' ? null : (opts.assignee as Assignee)
    if (opts.progress !== undefined) fields.progress = opts.progress
    if (opts.priority !== undefined) fields.priority = opts.priority as TicketPriority
    if (opts.labels !== undefined) fields.labels = opts.labels.split(',').map(l => l.trim()).filter(Boolean)
    if (Object.keys(fields).length === 0) {
      const msg = 'No fields to update. Use --assignee, --progress, --priority, or --labels.'
      if (opts.json) process.stderr.write(JSON.stringify({ error: msg }) + '\n')
      else console.error(`Error: ${msg}`)
      process.exit(1)
    }
    try {
      const ticket = patchTicket(id, fields, root)
      if (opts.json) {
        console.log(JSON.stringify(ticket, null, 2))
      } else {
        console.log(`✓ Updated ${id}`)
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (opts.json) process.stderr.write(JSON.stringify({ error: message }) + '\n')
      else console.error(`Error: ${message}`)
      process.exit(1)
    }
  })
