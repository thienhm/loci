import { afterEach, beforeEach, describe, expect, it } from 'bun:test'
import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  listDashboardProjects,
  listDashboardTickets,
  readDashboardTicket,
} from '../sqliteData'

let tmpHome: string
let healthyWorkspace: string
let missingWorkspace: string

beforeEach(() => {
  tmpHome = mkdtemp('loci-sqlite-home-')
  healthyWorkspace = mkdtemp('loci-sqlite-healthy-')
  missingWorkspace = join(tmpdir(), `loci-missing-${Date.now()}`)
  process.env.HOME = tmpHome
})

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true })
  rmSync(healthyWorkspace, { recursive: true, force: true })
  rmSync(missingWorkspace, { recursive: true, force: true })
})

function mkdtemp(prefix: string): string {
  return require('fs').mkdtempSync(join(tmpdir(), prefix))
}

function seedRegistry(rows: Array<{
  id: string
  name: string
  prefix: string
  path: string
  health_status?: string
  open_ticket_count?: number
  review_ticket_count?: number
  validation_failure_count?: number
}>) {
  mkdirSync(join(tmpHome, '.loci'), { recursive: true })
  const db = new Database(join(tmpHome, '.loci', 'registry.db'))
  db.run(`
    CREATE TABLE registered_project (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      prefix TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      loci_version TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      last_indexed_at TEXT,
      health_status TEXT NOT NULL DEFAULT 'warning',
      open_ticket_count INTEGER NOT NULL DEFAULT 0,
      review_ticket_count INTEGER NOT NULL DEFAULT 0,
      validation_failure_count INTEGER NOT NULL DEFAULT 0
    )
  `)
  const insert = db.prepare(`
    INSERT INTO registered_project (
      id, name, prefix, path, loci_version, last_seen_at, last_indexed_at,
      health_status, open_ticket_count, review_ticket_count, validation_failure_count
    )
    VALUES (?, ?, ?, ?, '1.1.0', '2026-05-26T00:00:00Z', NULL, ?, ?, ?, ?)
  `)
  for (const row of rows) {
    insert.run(
      row.id,
      row.name,
      row.prefix,
      row.path,
      row.health_status ?? 'healthy',
      row.open_ticket_count ?? 0,
      row.review_ticket_count ?? 0,
      row.validation_failure_count ?? 0
    )
  }
  db.close()
}

function seedProjectDb(workspace: string, options: { malformedLabels?: boolean } = {}) {
  mkdirSync(join(workspace, '.loci'), { recursive: true })
  const db = new Database(join(workspace, '.loci', 'loci.db'))
  db.run(`
    CREATE TABLE project (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      prefix TEXT NOT NULL,
      loci_version TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  db.run(`
    CREATE TABLE ticket (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      priority TEXT NOT NULL,
      assignee TEXT,
      labels_json TEXT NOT NULL DEFAULT '[]',
      progress INTEGER NOT NULL DEFAULT 0,
      risk_lane TEXT NOT NULL DEFAULT 'normal',
      readiness_state TEXT NOT NULL DEFAULT 'missing',
      validation_state TEXT NOT NULL DEFAULT 'missing',
      review_state TEXT NOT NULL DEFAULT 'not_ready',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      story_path TEXT,
      design_path TEXT,
      plan_path TEXT,
      validation_path TEXT,
      evidence_path TEXT,
      summary_path TEXT,
      lessons_path TEXT,
      harness_delta_path TEXT
    )
  `)
  db.run(`
    CREATE TABLE trace (
      id TEXT PRIMARY KEY,
      ticket_id TEXT NOT NULL,
      actor TEXT NOT NULL,
      event_type TEXT NOT NULL,
      task_summary TEXT NOT NULL,
      intake TEXT,
      actions_json TEXT NOT NULL DEFAULT '[]',
      files_read_json TEXT NOT NULL DEFAULT '[]',
      files_changed_json TEXT NOT NULL DEFAULT '[]',
      commands_json TEXT NOT NULL DEFAULT '[]',
      errors_json TEXT NOT NULL DEFAULT '[]',
      decisions_json TEXT NOT NULL DEFAULT '[]',
      outcome TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `)
  db.run(`
    INSERT INTO project (id, name, prefix, loci_version, created_at, updated_at)
    VALUES ('project-healthy', 'Healthy Project', 'HP', '1.1.0', '2026-05-26T00:00:00Z', '2026-05-26T00:00:00Z')
  `)
  const labels = options.malformedLabels ? '{bad json' : '["web","registry"]'
  db.run(`
    INSERT INTO ticket (
      id, title, status, priority, assignee, labels_json, progress, risk_lane,
      readiness_state, validation_state, review_state, created_at, updated_at,
      story_path, validation_path, summary_path
    )
    VALUES
      ('HP-001', 'Ready for review', 'in_review', 'high', 'agent:codex', ?, 80, 'normal',
       'ready', 'passing', 'ready', '2026-05-26T01:00:00Z', '2026-05-26T02:00:00Z',
       'loci/tickets/HP-001/story.md', 'loci/tickets/HP-001/validation.md', 'loci/tickets/HP-001/summary.md'),
      ('HP-002', 'Needs validation', 'ready', 'medium', NULL, '["validation"]', 25, 'high_risk',
       'ready', 'failing', 'not_ready', '2026-05-26T03:00:00Z', '2026-05-26T04:00:00Z',
       'loci/tickets/HP-002/story.md', 'loci/tickets/HP-002/validation.md', NULL),
      ('HP-003', 'Finished', 'done', 'low', NULL, '[]', 100, 'tiny',
       'ready', 'passing', 'approved', '2026-05-26T05:00:00Z', '2026-05-26T06:00:00Z',
       NULL, NULL, NULL)
  `, [labels])
  db.run(`
    INSERT INTO trace (
      id, ticket_id, actor, event_type, task_summary, outcome, created_at
    )
    VALUES ('TR-000001', 'HP-001', 'agent:codex', 'summary', 'Finished review prep', 'success', '2026-05-26T07:00:00Z')
  `)
  db.close()

  mkdirSync(join(workspace, 'loci', 'tickets', 'HP-001'), { recursive: true })
  writeFileSync(join(workspace, 'loci', 'tickets', 'HP-001', 'story.md'), '# Story\n\nReady for review.')
  writeFileSync(join(workspace, 'loci', 'tickets', 'HP-001', 'validation.md'), '# Validation\n\nPassing.')
  writeFileSync(join(workspace, 'loci', 'tickets', 'HP-001', 'summary.md'), '# Summary\n\nDone.')
}

describe('SQLite dashboard data', () => {
  it('lists registered projects with live ticket and health summaries', () => {
    seedRegistry([
      { id: 'project-healthy', name: 'Healthy Project', prefix: 'HP', path: healthyWorkspace },
    ])
    seedProjectDb(healthyWorkspace)

    const projects = listDashboardProjects(tmpHome)

    expect(projects).toHaveLength(1)
    expect(projects[0]).toMatchObject({
      id: 'project-healthy',
      name: 'Healthy Project',
      prefix: 'HP',
      path: healthyWorkspace,
      available: true,
      healthStatus: 'healthy',
      openTicketCount: 2,
      reviewTicketCount: 1,
      validationFailureCount: 1,
    })
    expect(projects[0].ticketStatusCounts).toMatchObject({
      ready: 1,
      in_review: 1,
      done: 1,
    })
  })

  it('keeps missing project paths visible instead of throwing', () => {
    seedRegistry([
      { id: 'project-missing', name: 'Missing Project', prefix: 'MP', path: missingWorkspace },
    ])

    const projects = listDashboardProjects(tmpHome)

    expect(projects).toHaveLength(1)
    expect(projects[0]).toMatchObject({
      id: 'project-missing',
      available: false,
      healthStatus: 'missing',
      openTicketCount: 0,
      reviewTicketCount: 0,
      validationFailureCount: 0,
    })
    expect(projects[0].unavailableReason).toContain('.loci/loci.db')
  })

  it('keeps unreadable project databases visible without hiding healthy projects', () => {
    mkdirSync(join(missingWorkspace, '.loci', 'loci.db'), { recursive: true })
    seedRegistry([
      { id: 'project-unreadable', name: 'Broken Project', prefix: 'BP', path: missingWorkspace },
      { id: 'project-healthy', name: 'Healthy Project', prefix: 'HP', path: healthyWorkspace },
    ])
    seedProjectDb(healthyWorkspace)

    const projects = listDashboardProjects(tmpHome)

    expect(projects).toHaveLength(2)
    expect(projects[0]).toMatchObject({
      id: 'project-unreadable',
      available: false,
      healthStatus: 'error',
      openTicketCount: 0,
      reviewTicketCount: 0,
      validationFailureCount: 0,
    })
    expect(projects[0].unavailableReason).toContain(join(missingWorkspace, '.loci', 'loci.db'))
    expect(projects[0].unavailableReason).toContain('unable to open')
    expect(projects[1]).toMatchObject({
      id: 'project-healthy',
      available: true,
      openTicketCount: 2,
    })
  })

  it('lists tickets and falls back to empty labels for malformed labels_json', () => {
    seedRegistry([
      { id: 'project-healthy', name: 'Healthy Project', prefix: 'HP', path: healthyWorkspace },
    ])
    seedProjectDb(healthyWorkspace, { malformedLabels: true })

    const tickets = listDashboardTickets('project-healthy', undefined, tmpHome)

    expect(tickets.map((ticket) => ticket.id)).toEqual(['HP-001', 'HP-002', 'HP-003'])
    expect(tickets[0]).toMatchObject({
      id: 'HP-001',
      title: 'Ready for review',
      status: 'in_review',
      labels: [],
      traceCount: 1,
    })
  })

  it('reads ticket docs from Rust path columns under the visible loci folder', () => {
    seedRegistry([
      { id: 'project-healthy', name: 'Healthy Project', prefix: 'HP', path: healthyWorkspace },
    ])
    seedProjectDb(healthyWorkspace)

    const ticket = readDashboardTicket('project-healthy', 'HP-001', tmpHome)

    expect(ticket?.id).toBe('HP-001')
    expect(ticket?.docs['story.md']).toBe('# Story\n\nReady for review.')
    expect(ticket?.docs['validation.md']).toBe('# Validation\n\nPassing.')
    expect(ticket?.docs['summary.md']).toBe('# Summary\n\nDone.')
  })
})
