import { Command } from 'commander'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { findWorkspaceRoot, getTicketsDir } from '../project'

function ticketDir(root: string, id: string): string {
  const dir = join(getTicketsDir(root), id)
  if (!existsSync(join(dir, 'ticket.json'))) {
    throw new Error(`Ticket "${id}" not found`)
  }
  return dir
}

export function readDoc(id: string, filename: string, root: string): string {
  const dir = ticketDir(root, id)
  const docPath = join(dir, filename)
  if (!existsSync(docPath)) {
    throw new Error(`Doc file "${filename}" not found in ticket ${id}`)
  }
  return readFileSync(docPath, 'utf8')
}

export function writeDoc(id: string, filename: string, content: string, root: string): void {
  const dir = ticketDir(root, id)
  writeFileSync(join(dir, filename), content, 'utf8')
}

function exitError(message: string, json: boolean): never {
  if (json) process.stderr.write(JSON.stringify({ error: message }) + '\n')
  else console.error(`Error: ${message}`)
  process.exit(1)
}

const readSubcommand = new Command('read')
  .description('Read a doc file from a ticket')
  .argument('<id>', 'Ticket ID (e.g. LCI-001)')
  .argument('<filename>', 'Doc filename (e.g. description.md)')
  .option('--json', 'Output as JSON')
  .action((id: string, filename: string, opts: { json?: boolean }) => {
    const root = findWorkspaceRoot()
    if (!root) exitError('No Loci project found. Run `loci init` first.', !!opts.json)
    try {
      const content = readDoc(id, filename, root)
      if (opts.json) console.log(JSON.stringify({ content }, null, 2))
      else process.stdout.write(content)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      exitError(message, !!opts.json)
    }
  })

const writeSubcommand = new Command('write')
  .description('Write content to a doc file in a ticket')
  .argument('<id>', 'Ticket ID (e.g. LCI-001)')
  .argument('<filename>', 'Doc filename (e.g. description.md)')
  .option('--content <content>', 'Content to write (reads from stdin if omitted)')
  .option('--json', 'Output as JSON')
  .action(async (id: string, filename: string, opts: { content?: string; json?: boolean }) => {
    const root = findWorkspaceRoot()
    if (!root) exitError('No Loci project found. Run `loci init` first.', !!opts.json)
    let content = opts.content
    if (content === undefined) {
      const chunks: Buffer[] = []
      for await (const chunk of process.stdin) chunks.push(chunk)
      content = Buffer.concat(chunks).toString('utf8')
    }
    try {
      writeDoc(id, filename, content, root)
      if (opts.json) console.log(JSON.stringify({ ok: true }, null, 2))
      else console.log(`✓ Written ${filename} for ${id}`)
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      exitError(message, !!opts.json)
    }
  })

export const docCommand = new Command('doc')
  .description('Read or write ticket doc files')
  .addCommand(readSubcommand)
  .addCommand(writeSubcommand)
