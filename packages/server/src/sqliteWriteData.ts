import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import type { DashboardTicket, TicketPriority, TicketStatus } from '@loci/shared'
import { hasSqliteRegistry, readDashboardTicket, registryDbPath } from './sqliteData'

const SQLITE_STATUSES = ['idea', 'shaped', 'ready', 'in_progress', 'in_review', 'done'] as const
const PRIORITIES = ['low', 'medium', 'high'] as const

interface RegistryRow {
  id: string
  prefix: string
  path: string
  health_status: string
}

interface TicketPatchInput {
  title?: string
  status?: string
  priority?: string
  labels?: unknown
  assignee?: unknown
  progress?: unknown
}

interface TicketCreateInput {
  title: string
  priority?: string
  labels?: unknown
  assignee?: unknown
}

interface WriteError {
  statusCode: number
  message: string
}

interface WritableProject {
  row: RegistryRow
  dbPath: string
}

export function validateSqliteWritableProject(projectId: string, home = process.env.HOME!): WriteError | null {
  const result = resolveWritableProject(projectId, home)
  return 'error' in result ? result.error : null
}

export function createDashboardTicketInSqlite(
  projectId: string,
  input: TicketCreateInput,
  home = process.env.HOME!
): { ticket: DashboardTicket } | { error: WriteError } {
  const resolved = resolveWritableProject(projectId, home)
  if ('error' in resolved) return { error: resolved.error }

  const title = typeof input.title === 'string' ? input.title.trim() : ''
  if (!title) return { error: { statusCode: 400, message: 'Title is required' } }

  const priority = normalizePriority(input.priority)
  if (!priority) return { error: { statusCode: 400, message: 'Invalid priority. Expected low, medium, or high.' } }

  const labels = normalizeLabels(input.labels)
  if (!labels) return { error: { statusCode: 400, message: 'Invalid labels. Expected an array of strings.' } }

  const assignee = normalizeAssignee(input.assignee)
  if (assignee === undefined) {
    return { error: { statusCode: 400, message: 'Invalid assignee. Expected string or null.' } }
  }

  const now = new Date().toISOString()
  const db = new Database(resolved.dbPath)
  let id = ''
  try {
    id = nextTicketId(db, resolved.row.prefix)
    const storyPath = join('loci', 'tickets', id, 'story.md')

    const tx = db.transaction(() => {
      db.run(
        `INSERT INTO ticket (
          id, title, status, priority, assignee, labels_json, progress, risk_lane,
          readiness_state, validation_state, review_state, created_at, updated_at, story_path
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'normal', 'missing', 'missing', 'not_ready', ?8, ?9, ?10)`,
        [id, title, 'idea', priority, assignee, JSON.stringify(labels), 0, now, now, storyPath]
      )
    })
    tx()

    const absStoryPath = join(resolved.row.path, storyPath)
    mkdirSync(dirname(absStoryPath), { recursive: true })
    writeFileSync(absStoryPath, `# Story\n\n${title}\n`)
  } catch (error) {
    return { error: { statusCode: 500, message: errorMessage(error, 'Failed to create SQLite ticket') } }
  } finally {
    db.close()
  }

  const ticket = readDashboardTicket(projectId, id, home)
  if (!ticket) return { error: { statusCode: 500, message: 'Created ticket could not be read back from SQLite' } }
  return { ticket }
}

export function patchDashboardTicketInSqlite(
  projectId: string,
  ticketId: string,
  input: TicketPatchInput,
  home = process.env.HOME!
): { ticket: DashboardTicket } | { error: WriteError } {
  const resolved = resolveWritableProject(projectId, home)
  if ('error' in resolved) return { error: resolved.error }

  const updates: string[] = []
  const values: unknown[] = []

  if (input.title !== undefined) {
    if (typeof input.title !== 'string' || !input.title.trim()) {
      return { error: { statusCode: 400, message: 'Invalid title. Expected non-empty string.' } }
    }
    updates.push('title = ?')
    values.push(input.title.trim())
  }

  if (input.status !== undefined) {
    const normalized = normalizeStatus(input.status)
    if (!normalized) {
      return { error: { statusCode: 400, message: 'Invalid status. Expected todo, idea, shaped, ready, in_progress, in_review, or done.' } }
    }
    updates.push('status = ?')
    values.push(normalized)
  }

  if (input.priority !== undefined) {
    const priority = normalizePriority(input.priority)
    if (!priority) return { error: { statusCode: 400, message: 'Invalid priority. Expected low, medium, or high.' } }
    updates.push('priority = ?')
    values.push(priority)
  }

  if (input.labels !== undefined) {
    const labels = normalizeLabels(input.labels)
    if (!labels) return { error: { statusCode: 400, message: 'Invalid labels. Expected an array of strings.' } }
    updates.push('labels_json = ?')
    values.push(JSON.stringify(labels))
  }

  if (input.assignee !== undefined) {
    const assignee = normalizeAssignee(input.assignee)
    if (assignee === undefined) {
      return { error: { statusCode: 400, message: 'Invalid assignee. Expected string or null.' } }
    }
    updates.push('assignee = ?')
    values.push(assignee)
  }

  if (input.progress !== undefined) {
    const progress = normalizeProgress(input.progress)
    if (progress === undefined) {
      return { error: { statusCode: 400, message: 'Invalid progress. Expected integer between 0 and 100.' } }
    }
    updates.push('progress = ?')
    values.push(progress)
  }

  if (updates.length === 0) {
    const existing = readDashboardTicket(projectId, ticketId, home)
    if (!existing) return { error: { statusCode: 404, message: 'Ticket not found' } }
    return { ticket: existing }
  }

  updates.push('updated_at = ?')
  values.push(new Date().toISOString())

  const db = new Database(resolved.dbPath)
  try {
    const existing = db.query<{ id: string }, [string]>('SELECT id FROM ticket WHERE id = ?1').get(ticketId)
    if (!existing) return { error: { statusCode: 404, message: 'Ticket not found' } }

    const tx = db.transaction(() => {
      db.run(
        `UPDATE ticket SET ${updates.join(', ')} WHERE id = ?`,
        [...values, ticketId]
      )
    })
    tx()
  } catch (error) {
    return { error: { statusCode: 500, message: errorMessage(error, 'Failed to patch SQLite ticket') } }
  } finally {
    db.close()
  }

  const ticket = readDashboardTicket(projectId, ticketId, home)
  if (!ticket) return { error: { statusCode: 500, message: 'Patched ticket could not be read back from SQLite' } }
  return { ticket }
}

function resolveWritableProject(
  projectId: string,
  home: string
): { error: WriteError } | WritableProject {
  if (!hasSqliteRegistry(home)) {
    return { error: { statusCode: 404, message: 'SQLite registry is unavailable' } }
  }

  const registry = Database.open(registryDbPath(home), { readonly: true })
  try {
    const row = registry
      .query<RegistryRow, [string]>(`
        SELECT id, prefix, path, health_status
        FROM registered_project
        WHERE id = ?1
      `)
      .get(projectId)

    if (!row) return { error: { statusCode: 404, message: 'Project not found' } }
    if (row.health_status !== 'healthy') {
      return { error: { statusCode: 409, message: `Project is not writable (health status: ${row.health_status})` } }
    }

    const dbPath = join(row.path, '.loci', 'loci.db')
    if (!existsSync(dbPath)) {
      return { error: { statusCode: 409, message: `Project database is missing: ${dbPath}` } }
    }

    return { row, dbPath }
  } finally {
    registry.close()
  }
}

function nextTicketId(db: Database, prefix: string): string {
  const rows = db.query<{ id: string }, []>('SELECT id FROM ticket WHERE id LIKE ?1').all(`${prefix}-%`)
  const maxValue = rows.reduce((max, row) => {
    const suffix = row.id.slice(prefix.length + 1)
    const value = Number.parseInt(suffix, 10)
    return Number.isFinite(value) ? Math.max(max, value) : max
  }, 0)
  return `${prefix}-${String(maxValue + 1).padStart(3, '0')}`
}

function normalizeStatus(input: string): TicketStatus | null {
  if (input === 'todo') return 'idea'
  if (SQLITE_STATUSES.includes(input as (typeof SQLITE_STATUSES)[number])) {
    return input as TicketStatus
  }
  return null
}

function normalizePriority(input: unknown): TicketPriority | null {
  if (input === undefined) return 'medium'
  if (PRIORITIES.includes(input as (typeof PRIORITIES)[number])) {
    return input as TicketPriority
  }
  return null
}

function normalizeLabels(input: unknown): string[] | null {
  if (input === undefined) return []
  if (!Array.isArray(input)) return null
  if (!input.every((label) => typeof label === 'string')) return null
  return input
}

function normalizeAssignee(input: unknown): string | null | undefined {
  if (input === undefined) return null
  if (input === null) return null
  if (typeof input === 'string') return input
  return undefined
}

function normalizeProgress(input: unknown): number | undefined {
  if (!Number.isInteger(input)) return undefined
  const value = input as number
  if (value < 0 || value > 100) return undefined
  return value
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
