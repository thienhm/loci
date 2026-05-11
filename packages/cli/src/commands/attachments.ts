import { Command } from 'commander'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { findWorkspaceRoot, getTicketsDir } from '../project'

export function listAttachments(id: string, root: string): string[] {
  const ticketDir = join(getTicketsDir(root), id)
  if (!existsSync(join(ticketDir, 'ticket.json'))) {
    throw new Error(`Ticket "${id}" not found`)
  }
  const attachmentsPath = join(ticketDir, 'attachments.json')
  if (!existsSync(attachmentsPath)) return []
  return JSON.parse(readFileSync(attachmentsPath, 'utf8')) as string[]
}

export const attachmentsCommand = new Command('attachments')
  .description('List attachments for a ticket')
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
      const attachments = listAttachments(id, root)
      if (opts.json) {
        console.log(JSON.stringify({ attachments }, null, 2))
      } else {
        if (attachments.length === 0) {
          console.log(`No attachments for ${id}.`)
        } else {
          console.log(`Attachments for ${id}:`)
          for (const a of attachments) console.log(`  ${a}`)
        }
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      if (opts.json) process.stderr.write(JSON.stringify({ error: message }) + '\n')
      else console.error(`Error: ${message}`)
      process.exit(1)
    }
  })
