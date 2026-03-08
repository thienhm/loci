import { Command } from 'commander'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { findWorkspaceRoot, getTicketsDir } from '../project'
import type { Ticket } from '@loci/shared'

const STATUS_LABEL: Record<string, string> = {
  todo: 'Todo',
  in_progress: 'In Progress',
  done: 'Done',
}

const PRIORITY_LABEL: Record<string, string> = {
  low: 'Low',
  medium: 'Med',
  high: 'High',
}

export const listCommand = new Command('list')
  .description('List all tickets in the current project')
  .action(() => {
    const root = findWorkspaceRoot()
    if (!root) {
      console.error('Error: No Loci project found. Run `loci init` first.')
      process.exit(1)
    }

    const ticketsDir = getTicketsDir(root)
    if (!existsSync(ticketsDir)) {
      console.log('No tickets yet. Run `loci add "title"` to create one.')
      return
    }

    const tickets: Ticket[] = readdirSync(ticketsDir)
      .map((id) => {
        const ticketPath = join(ticketsDir, id, 'ticket.json')
        if (!existsSync(ticketPath)) return null
        return JSON.parse(readFileSync(ticketPath, 'utf8')) as Ticket
      })
      .filter(Boolean) as Ticket[]

    if (tickets.length === 0) {
      console.log('No tickets yet. Run `loci add "title"` to create one.')
      return
    }

    // Sort by createdAt descending (newest first)
    tickets.sort((a, b) => b.createdAt.localeCompare(a.createdAt))

    // Print table
    const idW = 10, titleW = 40, statusW = 12, prioW = 6, assigneeW = 16
    const header = [
      'ID'.padEnd(idW),
      'Title'.padEnd(titleW),
      'Status'.padEnd(statusW),
      'Prio'.padEnd(prioW),
      'Assignee'.padEnd(assigneeW),
    ].join('  ')

    console.log(header)
    console.log('─'.repeat(header.length))

    for (const t of tickets) {
      const row = [
        t.id.padEnd(idW),
        t.title.slice(0, titleW - 1).padEnd(titleW),
        (STATUS_LABEL[t.status] ?? t.status).padEnd(statusW),
        (PRIORITY_LABEL[t.priority] ?? t.priority).padEnd(prioW),
        (t.assignee ?? '—').padEnd(assigneeW),
      ].join('  ')
      console.log(row)
    }
  })
