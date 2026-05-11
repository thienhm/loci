import { Command } from 'commander'
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { findWorkspaceRoot, getTicketsDir } from '../project'
import type { Ticket, TicketWithDocs } from '@loci/shared'

export function getTicket(id: string, root: string): TicketWithDocs {
  const ticketDir = join(getTicketsDir(root), id)
  const ticketPath = join(ticketDir, 'ticket.json')
  if (!existsSync(ticketPath)) {
    const archivedPath = join(getTicketsDir(root), 'archived', id, 'ticket.json')
    if (!existsSync(archivedPath)) {
      throw new Error(`Ticket "${id}" not found`)
    }
    const ticket: Ticket = JSON.parse(readFileSync(archivedPath, 'utf8'))
    return { ...ticket, docs: readDocs(join(getTicketsDir(root), 'archived', id)) }
  }
  const ticket: Ticket = JSON.parse(readFileSync(ticketPath, 'utf8'))
  return { ...ticket, docs: readDocs(ticketDir) }
}

function readDocs(ticketDir: string): Record<string, string> {
  const docs: Record<string, string> = {}
  const excluded = new Set(['ticket.json', 'attachments.json'])
  for (const file of readdirSync(ticketDir)) {
    if (!excluded.has(file) && file.endsWith('.md')) {
      docs[file] = readFileSync(join(ticketDir, file), 'utf8')
    }
  }
  return docs
}

export const getCommand = new Command('get')
  .description('Get a ticket with all its docs')
  .argument('<id>', 'Ticket ID (e.g. LCI-001)')
  .option('--json', 'Output as JSON')
  .action((id: string, opts: { json?: boolean }) => {
    const root = findWorkspaceRoot()
    if (!root) {
      if (opts.json) process.stderr.write(JSON.stringify({ error: 'No Loci project found. Run `loci init` first.' }) + '\n')
      else console.error('Error: No Loci project found. Run `loci init` first.')
      process.exit(1)
    }
    try {
      const ticket = getTicket(id, root)
      if (opts.json) {
        console.log(JSON.stringify(ticket, null, 2))
      } else {
        console.log(`${ticket.id}: ${ticket.title}`)
        console.log(`Status: ${ticket.status} | Priority: ${ticket.priority} | Progress: ${ticket.progress}%`)
        if (ticket.assignee) console.log(`Assignee: ${ticket.assignee}`)
        if (ticket.labels.length) console.log(`Labels: ${ticket.labels.join(', ')}`)
        const docFiles = Object.keys(ticket.docs)
        if (docFiles.length) console.log(`\nDocs: ${docFiles.join(', ')}`)
      }
    } catch (e: any) {
      if (opts.json) process.stderr.write(JSON.stringify({ error: e.message }) + '\n')
      else console.error(`Error: ${e.message}`)
      process.exit(1)
    }
  })
