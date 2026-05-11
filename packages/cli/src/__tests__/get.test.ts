import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

let tmpHome: string
let tmpWorkspace: string
let origHome: string | undefined

function setupEnv() {
  origHome = process.env.HOME
  tmpHome = mkdtempSync(join(tmpdir(), 'loci-test-home-'))
  tmpWorkspace = mkdtempSync(join(tmpdir(), 'loci-test-ws-'))
  process.env.HOME = tmpHome
}

function teardownEnv() {
  process.env.HOME = origHome
  rmSync(tmpHome, { recursive: true, force: true })
  rmSync(tmpWorkspace, { recursive: true, force: true })
}

function seedTicket(root: string, id = 'TST-001', extra: Record<string, string> = {}) {
  const ticketDir = join(root, '.loci', 'tickets', id)
  mkdirSync(ticketDir, { recursive: true })
  writeFileSync(
    join(ticketDir, 'ticket.json'),
    JSON.stringify({
      id,
      title: 'Test ticket',
      status: 'todo',
      priority: 'medium',
      labels: [],
      assignee: null,
      progress: 0,
      archived: false,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    }, null, 2)
  )
  writeFileSync(join(ticketDir, 'attachments.json'), JSON.stringify([], null, 2))
  writeFileSync(join(ticketDir, 'description.md'), `# ${id}\n\nDescription here.`)
  for (const [name, content] of Object.entries(extra)) {
    writeFileSync(join(ticketDir, name), content)
  }
}

import { getTicket } from '../commands/get'

describe('getTicket', () => {
  beforeEach(setupEnv)
  afterEach(teardownEnv)

  it('returns ticket with docs map', () => {
    seedTicket(tmpWorkspace, 'TST-001', { 'design.md': '# Design\n\nContent.' })
    const result = getTicket('TST-001', tmpWorkspace)
    expect(result.id).toBe('TST-001')
    expect(result.title).toBe('Test ticket')
    expect(result.docs['description.md']).toContain('Description here.')
    expect(result.docs['design.md']).toContain('Design')
  })

  it('throws when ticket not found', () => {
    mkdirSync(join(tmpWorkspace, '.loci', 'tickets'), { recursive: true })
    expect(() => getTicket('TST-999', tmpWorkspace)).toThrow('Ticket "TST-999" not found')
  })

  it('does not include attachments.json in docs', () => {
    seedTicket(tmpWorkspace)
    const result = getTicket('TST-001', tmpWorkspace)
    expect(Object.keys(result.docs)).not.toContain('attachments.json')
    expect(Object.keys(result.docs)).not.toContain('ticket.json')
  })

  it('finds ticket in archived directory', () => {
    const archivedDir = join(tmpWorkspace, '.loci', 'tickets', 'archived', 'TST-001')
    mkdirSync(archivedDir, { recursive: true })
    writeFileSync(
      join(archivedDir, 'ticket.json'),
      JSON.stringify({
        id: 'TST-001',
        title: 'Archived ticket',
        status: 'done',
        priority: 'low',
        labels: [],
        assignee: null,
        progress: 100,
        archived: true,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      }, null, 2)
    )
    writeFileSync(join(archivedDir, 'description.md'), '# Archived\n\nDone.')
    // Make sure the regular tickets dir exists but doesn't have this ticket
    mkdirSync(join(tmpWorkspace, '.loci', 'tickets'), { recursive: true })
    const result = getTicket('TST-001', tmpWorkspace)
    expect(result.id).toBe('TST-001')
    expect(result.archived).toBe(true)
    expect(result.docs['description.md']).toContain('Archived')
  })
})
