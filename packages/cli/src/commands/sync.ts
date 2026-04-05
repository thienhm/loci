import { Command } from 'commander'
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync } from 'fs'
import { join } from 'path'
import { findWorkspaceRoot, readProject, getTicketsDir } from '../project'
import { generateLociMd } from './init'
import type { Ticket } from '@loci/shared'

/**
 * Migrate archived tickets from .loci/tickets/ into .loci/tickets/archived/.
 * Scans ticket folders, reads ticket.json, and moves any with archived: true.
 */
function migrateArchivedTickets(workspaceRoot: string): number {
  const ticketsDir = getTicketsDir(workspaceRoot)
  if (!existsSync(ticketsDir)) return 0

  const archivedDir = join(ticketsDir, 'archived')
  let migrated = 0

  for (const entry of readdirSync(ticketsDir, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'archived') continue
    const ticketJsonPath = join(ticketsDir, entry.name, 'ticket.json')
    if (!existsSync(ticketJsonPath)) continue

    try {
      const ticket: Ticket = JSON.parse(readFileSync(ticketJsonPath, 'utf8'))
      if (ticket.archived) {
        mkdirSync(archivedDir, { recursive: true })
        renameSync(join(ticketsDir, entry.name), join(archivedDir, entry.name))
        migrated++
      }
    } catch {
      // skip malformed tickets
    }
  }

  return migrated
}

export const syncCommand = new Command('sync')
  .description('Regenerate LOCI.md and restructure .loci folder')
  .option('-p, --port <number>', 'port the server runs on', '3333')
  .action(async (opts) => {
    const cwd = process.cwd()
    const workspaceRoot = findWorkspaceRoot(cwd)

    if (!workspaceRoot) {
      console.error('Error: No Loci project found. Run `loci init` first.')
      process.exit(1)
    }

    const project = readProject(workspaceRoot)
    const port = parseInt(opts.port, 10)
    const lociMdPath = join(workspaceRoot, 'LOCI.md')

    await Bun.write(lociMdPath, generateLociMd(project, port))
    console.log(`✓ LOCI.md updated for project "${project.name}" (${project.prefix})`)

    // Migrate archived tickets to archived/ subfolder
    const migrated = migrateArchivedTickets(workspaceRoot)
    if (migrated > 0) {
      console.log(`✓ Migrated ${migrated} archived ticket${migrated === 1 ? '' : 's'} to tickets/archived/`)
    }
  })
