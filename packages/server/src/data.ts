import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Project, Registry, RegistryEntry, Ticket, TicketWithDocs } from '@loci/shared'

function registryPath(): string {
  return join(process.env.HOME!, '.loci', 'registry.json')
}

// ---------------------------------------------------------------------------
// Registry helpers
// ---------------------------------------------------------------------------

export function readRegistry(): Registry {
  const path = registryPath()
  if (!existsSync(path)) return { projects: [] }
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function findRegistryEntry(projectId: string): RegistryEntry | null {
  const registry = readRegistry()
  return registry.projects.find((p) => p.id === projectId) ?? null
}

// ---------------------------------------------------------------------------
// Project helpers
// ---------------------------------------------------------------------------

export function readProject(workspaceRoot: string): Project {
  const projectJsonPath = join(workspaceRoot, '.loci', 'project.json')
  return JSON.parse(readFileSync(projectJsonPath, 'utf8'))
}

// ---------------------------------------------------------------------------
// Ticket helpers
// ---------------------------------------------------------------------------

function getTicketsDir(workspaceRoot: string): string {
  return join(workspaceRoot, '.loci', 'tickets')
}

function getTicketDir(workspaceRoot: string, ticketId: string): string {
  return join(getTicketsDir(workspaceRoot), ticketId)
}

export function listTickets(workspaceRoot: string): Ticket[] {
  const ticketsDir = getTicketsDir(workspaceRoot)
  if (!existsSync(ticketsDir)) return []

  const entries = readdirSync(ticketsDir, { withFileTypes: true })
  const tickets: Ticket[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const ticketJsonPath = join(ticketsDir, entry.name, 'ticket.json')
    if (!existsSync(ticketJsonPath)) continue
    try {
      tickets.push(JSON.parse(readFileSync(ticketJsonPath, 'utf8')))
    } catch {
      // skip malformed tickets
    }
  }

  return tickets
}

export function readTicketWithDocs(workspaceRoot: string, ticketId: string): TicketWithDocs | null {
  const ticketDir = getTicketDir(workspaceRoot, ticketId)
  const ticketJsonPath = join(ticketDir, 'ticket.json')
  if (!existsSync(ticketJsonPath)) return null

  const ticket: Ticket = JSON.parse(readFileSync(ticketJsonPath, 'utf8'))

  // Collect all .md files and read their contents into a map
  const docs: Record<string, string> = {}
  for (const f of readdirSync(ticketDir).filter((f) => f.endsWith('.md')).sort()) {
    docs[f] = readFileSync(join(ticketDir, f), 'utf8')
  }

  return { ...ticket, docs }
}

export function writeTicket(workspaceRoot: string, ticket: Ticket): void {
  const ticketDir = getTicketDir(workspaceRoot, ticket.id)
  writeFileSync(join(ticketDir, 'ticket.json'), JSON.stringify(ticket, null, 2))
}

export function createTicket(workspaceRoot: string, ticket: Ticket): void {
  const ticketDir = getTicketDir(workspaceRoot, ticket.id)
  mkdirSync(ticketDir, { recursive: true })
  writeFileSync(join(ticketDir, 'ticket.json'), JSON.stringify(ticket, null, 2))
  writeFileSync(join(ticketDir, 'description.md'), `# ${ticket.title}\n\n`)
  writeFileSync(join(ticketDir, 'attachments.json'), JSON.stringify([], null, 2))
}

// ---------------------------------------------------------------------------
// Doc helpers
// ---------------------------------------------------------------------------

export function readTicketDoc(workspaceRoot: string, ticketId: string, filename: string): string | null {
  const docPath = join(getTicketDir(workspaceRoot, ticketId), filename)
  if (!existsSync(docPath)) return null
  return readFileSync(docPath, 'utf8')
}

export function writeTicketDoc(workspaceRoot: string, ticketId: string, filename: string, content: string): void {
  const docPath = join(getTicketDir(workspaceRoot, ticketId), filename)
  writeFileSync(docPath, content)
}

// ---------------------------------------------------------------------------
// Attachments helpers
// ---------------------------------------------------------------------------

export function readAttachments(workspaceRoot: string, ticketId: string): string[] {
  const attachPath = join(getTicketDir(workspaceRoot, ticketId), 'attachments.json')
  if (!existsSync(attachPath)) return []
  return JSON.parse(readFileSync(attachPath, 'utf8'))
}

export function writeAttachments(workspaceRoot: string, ticketId: string, attachments: string[]): void {
  const attachPath = join(getTicketDir(workspaceRoot, ticketId), 'attachments.json')
  writeFileSync(attachPath, JSON.stringify(attachments, null, 2))
}

// ---------------------------------------------------------------------------
// File storage helpers
// ---------------------------------------------------------------------------

export function getFilesDir(workspaceRoot: string, ticketId: string): string {
  return join(getTicketDir(workspaceRoot, ticketId), 'files')
}

export interface FileInfo {
  name: string
  size: number
  mimeType: string
}

export function listFiles(workspaceRoot: string, ticketId: string): FileInfo[] {
  const dir = getFilesDir(workspaceRoot, ticketId)
  if (!existsSync(dir)) return []

  const entries = readdirSync(dir, { withFileTypes: true })
  return entries
    .filter((e) => e.isFile())
    .map((e) => {
      const stat = statSync(join(dir, e.name))
      return {
        name: e.name,
        size: stat.size,
        mimeType: guessMimeType(e.name),
      }
    })
}

export function resolveUniqueFilename(dir: string, filename: string): string {
  if (!existsSync(join(dir, filename))) return filename

  const dotIdx = filename.lastIndexOf('.')
  const base = dotIdx > 0 ? filename.slice(0, dotIdx) : filename
  const ext = dotIdx > 0 ? filename.slice(dotIdx) : ''

  let counter = 1
  while (existsSync(join(dir, `${base}(${counter})${ext}`))) {
    counter++
  }
  return `${base}(${counter})${ext}`
}

export function guessMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    pdf: 'application/pdf',
    md: 'text/markdown',
    txt: 'text/plain',
    json: 'application/json',
  }
  return map[ext ?? ''] ?? 'application/octet-stream'
}
