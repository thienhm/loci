import { Database } from 'bun:sqlite'
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { join, basename } from 'path'
import type {
  DashboardProject,
  DashboardTicket,
  DashboardTicketWithDocs,
  ProjectHealthStatus,
  TicketStatus,
  TicketStatusCounts,
} from '@loci/shared'

interface RegistryRow {
  id: string
  name: string
  prefix: string
  path: string
  loci_version: string
  last_seen_at: string
  last_indexed_at: string | null
  health_status: string
  open_ticket_count: number
  review_ticket_count: number
  validation_failure_count: number
}

interface TicketRow {
  id: string
  title: string
  status: string
  priority: string
  assignee: string | null
  labels_json: string
  progress: number
  risk_lane: string
  readiness_state: string
  validation_state: string
  review_state: string
  created_at: string
  updated_at: string
  story_path: string | null
  design_path: string | null
  plan_path: string | null
  validation_path: string | null
  evidence_path: string | null
  summary_path: string | null
  lessons_path: string | null
  harness_delta_path: string | null
}

export interface TicketFilters {
  status?: string
  assignee?: string
  archived?: string
}

const LIFECYCLE_STATUSES = ['idea', 'shaped', 'ready', 'in_progress', 'in_review', 'done'] as const

export function registryDbPath(home = process.env.HOME!): string {
  return join(home, '.loci', 'registry.db')
}

export function hasSqliteRegistry(home = process.env.HOME!): boolean {
  return existsSync(registryDbPath(home))
}

export function listDashboardProjects(home = process.env.HOME!): DashboardProject[] {
  if (!hasSqliteRegistry(home)) return []

  const registry = openReadOnly(registryDbPath(home))
  try {
    const rows = registry
      .query<RegistryRow, []>(`
        SELECT id, name, prefix, path, loci_version, last_seen_at, last_indexed_at,
               health_status, open_ticket_count, review_ticket_count, validation_failure_count
        FROM registered_project
        ORDER BY name COLLATE NOCASE ASC, prefix ASC
      `)
      .all()

    return rows.map(projectSummaryFromRegistryRow)
  } finally {
    registry.close()
  }
}

export function listDashboardTickets(
  projectId: string,
  filters: TicketFilters = {},
  home = process.env.HOME!
): DashboardTicket[] {
  const entry = findRegistryRow(projectId, home)
  if (!entry) return []

  const projectDbPath = join(entry.path, '.loci', 'loci.db')
  if (!existsSync(projectDbPath)) return []

  const db = openReadOnly(projectDbPath)
  try {
    let tickets = readTickets(db)
    if (filters.status) tickets = tickets.filter((ticket) => ticket.status === normalizeStatus(filters.status))
    if (filters.assignee) tickets = tickets.filter((ticket) => ticket.assignee === filters.assignee)
    if (filters.archived === 'true') {
      tickets = []
    } else if (filters.archived !== 'all') {
      tickets = tickets.filter((ticket) => ticket.archived !== true)
    }
    return tickets
  } finally {
    db.close()
  }
}

export function readDashboardTicket(
  projectId: string,
  ticketId: string,
  home = process.env.HOME!
): DashboardTicketWithDocs | null {
  const entry = findRegistryRow(projectId, home)
  if (!entry) return null

  const projectDbPath = join(entry.path, '.loci', 'loci.db')
  if (!existsSync(projectDbPath)) return null

  const db = openReadOnly(projectDbPath)
  try {
    const row = db
      .query<TicketRow, [string]>(ticketSelectSql('WHERE id = ?1'))
      .get(ticketId)
    if (!row) return null

    const ticket = ticketFromRow(row, db)
    return {
      ...ticket,
      docs: readTicketDocs(entry.path, row),
    }
  } finally {
    db.close()
  }
}

export function readDashboardDoc(
  projectId: string,
  ticketId: string,
  filename: string,
  home = process.env.HOME!
): string | null {
  const resolved = resolveDashboardDocPath(projectId, ticketId, filename, home)
  if (!resolved || !existsSync(resolved)) return null
  return readFileSync(resolved, 'utf8')
}

export function writeDashboardDoc(
  projectId: string,
  ticketId: string,
  filename: string,
  content: string,
  home = process.env.HOME!
): boolean {
  const resolved = resolveDashboardDocPath(projectId, ticketId, filename, home)
  if (!resolved) return false
  writeFileSync(resolved, content)
  return true
}

function projectSummaryFromRegistryRow(row: RegistryRow): DashboardProject {
  const projectDbPath = join(row.path, '.loci', 'loci.db')
  if (!existsSync(projectDbPath)) {
    return {
      ...registryRowBase(row),
      healthStatus: 'missing',
      available: false,
      unavailableReason: `Missing project database: ${projectDbPath}`,
      openTicketCount: 0,
      reviewTicketCount: 0,
      validationFailureCount: 0,
      ticketStatusCounts: emptyStatusCounts(),
    }
  }

  let db: Database | null = null
  try {
    db = openReadOnly(projectDbPath)
    const tickets = readTickets(db)
    return {
      ...registryRowBase(row),
      healthStatus: normalizeHealth(row.health_status),
      available: true,
      openTicketCount: tickets.filter(isOpenTicket).length,
      reviewTicketCount: tickets.filter((ticket) => ticket.status === 'in_review').length,
      validationFailureCount: tickets.filter((ticket) => ticket.validationState === 'failing').length,
      ticketStatusCounts: statusCounts(tickets),
    }
  } catch (error) {
    return {
      ...registryRowBase(row),
      healthStatus: 'error',
      available: false,
      unavailableReason: databaseOpenError(projectDbPath, error),
      openTicketCount: row.open_ticket_count,
      reviewTicketCount: row.review_ticket_count,
      validationFailureCount: row.validation_failure_count,
      ticketStatusCounts: emptyStatusCounts(),
    }
  } finally {
    db?.close()
  }
}

function databaseOpenError(path: string, error: unknown): string {
  const reason = error instanceof Error ? error.message : 'unknown error'
  return `unable to open project database ${path}: ${reason}`
}

function registryRowBase(row: RegistryRow) {
  return {
    id: row.id,
    name: row.name,
    prefix: row.prefix,
    path: row.path,
    lociVersion: row.loci_version,
    lastSeenAt: row.last_seen_at,
    lastIndexedAt: row.last_indexed_at,
  }
}

function findRegistryRow(projectId: string, home: string): RegistryRow | null {
  if (!hasSqliteRegistry(home)) return null
  const registry = openReadOnly(registryDbPath(home))
  try {
    return registry
      .query<RegistryRow, [string]>(`
        SELECT id, name, prefix, path, loci_version, last_seen_at, last_indexed_at,
               health_status, open_ticket_count, review_ticket_count, validation_failure_count
        FROM registered_project
        WHERE id = ?1
      `)
      .get(projectId) ?? null
  } finally {
    registry.close()
  }
}

function readTickets(db: Database): DashboardTicket[] {
  return db
    .query<TicketRow, []>(ticketSelectSql('ORDER BY created_at ASC, id ASC'))
    .all()
    .map((row) => ticketFromRow(row, db))
}

function ticketSelectSql(suffix: string): string {
  return `
    SELECT id, title, status, priority, assignee, labels_json, progress, risk_lane,
           readiness_state, validation_state, review_state, created_at, updated_at,
           story_path, design_path, plan_path, validation_path, evidence_path,
           summary_path, lessons_path, harness_delta_path
    FROM ticket
    ${suffix}
  `
}

function ticketFromRow(row: TicketRow, db: Database): DashboardTicket {
  return {
    id: row.id,
    title: row.title,
    status: normalizeStatus(row.status),
    priority: row.priority as DashboardTicket['priority'],
    labels: parseStringArray(row.labels_json),
    assignee: row.assignee as DashboardTicket['assignee'],
    progress: row.progress,
    riskLane: row.risk_lane,
    readinessState: row.readiness_state,
    validationState: row.validation_state,
    reviewState: row.review_state,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    storyPath: row.story_path,
    designPath: row.design_path,
    planPath: row.plan_path,
    validationPath: row.validation_path,
    evidencePath: row.evidence_path,
    summaryPath: row.summary_path,
    lessonsPath: row.lessons_path,
    harnessDeltaPath: row.harness_delta_path,
    traceCount: traceCount(db, row.id),
    archived: false,
  }
}

function traceCount(db: Database, ticketId: string): number {
  try {
    const result = db
      .query<{ count: number }, [string]>('SELECT COUNT(*) AS count FROM trace WHERE ticket_id = ?1')
      .get(ticketId)
    return result?.count ?? 0
  } catch {
    return 0
  }
}

function readTicketDocs(projectRoot: string, row: TicketRow): Record<string, string> {
  const docs: Record<string, string> = {}
  const paths = [
    row.story_path,
    row.design_path,
    row.plan_path,
    row.validation_path,
    row.evidence_path,
    row.summary_path,
    row.lessons_path,
    row.harness_delta_path,
  ]

  for (const relativePath of paths) {
    if (!relativePath) continue
    const fullPath = join(projectRoot, relativePath)
    if (!existsSync(fullPath)) continue
    docs[basename(relativePath)] = readFileSync(fullPath, 'utf8')
  }

  return docs
}

function resolveDashboardDocPath(
  projectId: string,
  ticketId: string,
  filename: string,
  home: string
): string | null {
  const entry = findRegistryRow(projectId, home)
  if (!entry) return null

  const projectDbPath = join(entry.path, '.loci', 'loci.db')
  if (!existsSync(projectDbPath)) return null

  const db = openReadOnly(projectDbPath)
  try {
    const row = db
      .query<TicketRow, [string]>(ticketSelectSql('WHERE id = ?1'))
      .get(ticketId)
    if (!row) return null

    const paths = [
      row.story_path,
      row.design_path,
      row.plan_path,
      row.validation_path,
      row.evidence_path,
      row.summary_path,
      row.lessons_path,
      row.harness_delta_path,
    ]
    const relativePath = paths.find((path) => path && basename(path) === filename)
    return relativePath ? join(entry.path, relativePath) : null
  } finally {
    db.close()
  }
}

function parseStringArray(value: string): string[] {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

function emptyStatusCounts(): TicketStatusCounts {
  return {
    idea: 0,
    shaped: 0,
    ready: 0,
    in_progress: 0,
    in_review: 0,
    done: 0,
  }
}

function statusCounts(tickets: DashboardTicket[]): TicketStatusCounts {
  const counts = emptyStatusCounts()
  for (const ticket of tickets) {
    const status = normalizeStatus(ticket.status)
    if (status === 'todo') {
      counts.idea++
    } else if (LIFECYCLE_STATUSES.includes(status as (typeof LIFECYCLE_STATUSES)[number])) {
      counts[status as keyof Omit<TicketStatusCounts, 'todo'>]++
    }
  }
  return counts
}

function isOpenTicket(ticket: DashboardTicket): boolean {
  return ticket.status !== 'done'
}

function normalizeStatus(status: string): TicketStatus {
  if (status === 'todo') return 'idea'
  if (LIFECYCLE_STATUSES.includes(status as (typeof LIFECYCLE_STATUSES)[number])) {
    return status as TicketStatus
  }
  return 'idea'
}

function normalizeHealth(status: string): ProjectHealthStatus {
  if (status === 'healthy' || status === 'warning' || status === 'error' || status === 'missing') {
    return status
  }
  return 'warning'
}

function openReadOnly(path: string): Database {
  try {
    return Database.open(path, { readonly: true })
  } catch (error) {
    if (!isUnableToOpenDatabase(error)) throw error
    return Database.open(path, { readwrite: true, create: false })
  }
}

function isUnableToOpenDatabase(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes('unable to open database file')
}
