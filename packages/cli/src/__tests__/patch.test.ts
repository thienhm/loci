import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import type { Ticket } from '@loci/shared'

let tmpHome: string
let tmpWorkspace: string

function setupEnv() {
  tmpHome = mkdtempSync(join(tmpdir(), 'loci-test-home-'))
  tmpWorkspace = mkdtempSync(join(tmpdir(), 'loci-test-ws-'))
  process.env.HOME = tmpHome
}

function teardownEnv() {
  rmSync(tmpHome, { recursive: true, force: true })
  rmSync(tmpWorkspace, { recursive: true, force: true })
}

function seedTicket(root: string, id = 'TST-001') {
  const ticketDir = join(root, '.loci', 'tickets', id)
  mkdirSync(ticketDir, { recursive: true })
  const ticket: Ticket = {
    id, title: 'Test', status: 'todo', priority: 'medium',
    labels: [], assignee: null, progress: 0, archived: false,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
  }
  writeFileSync(join(ticketDir, 'ticket.json'), JSON.stringify(ticket, null, 2))
}

function readTicket(root: string, id: string): Ticket {
  return JSON.parse(readFileSync(join(root, '.loci', 'tickets', id, 'ticket.json'), 'utf8'))
}

import { patchTicket } from '../commands/patch'

describe('patchTicket', () => {
  beforeEach(setupEnv)
  afterEach(teardownEnv)

  it('updates assignee', () => {
    seedTicket(tmpWorkspace)
    patchTicket('TST-001', { assignee: 'agent:claude' }, tmpWorkspace)
    expect(readTicket(tmpWorkspace, 'TST-001').assignee).toBe('agent:claude')
  })

  it('updates progress', () => {
    seedTicket(tmpWorkspace)
    patchTicket('TST-001', { progress: 50 }, tmpWorkspace)
    expect(readTicket(tmpWorkspace, 'TST-001').progress).toBe(50)
  })

  it('updates priority', () => {
    seedTicket(tmpWorkspace)
    patchTicket('TST-001', { priority: 'high' }, tmpWorkspace)
    expect(readTicket(tmpWorkspace, 'TST-001').priority).toBe('high')
  })

  it('updates labels', () => {
    seedTicket(tmpWorkspace)
    patchTicket('TST-001', { labels: ['bug', 'cli'] }, tmpWorkspace)
    expect(readTicket(tmpWorkspace, 'TST-001').labels).toEqual(['bug', 'cli'])
  })

  it('sets updatedAt', () => {
    seedTicket(tmpWorkspace)
    const before = new Date('2026-01-01T00:00:00.000Z').getTime()
    patchTicket('TST-001', { progress: 10 }, tmpWorkspace)
    const after = new Date(readTicket(tmpWorkspace, 'TST-001').updatedAt).getTime()
    expect(after).toBeGreaterThan(before)
  })

  it('throws when ticket not found', () => {
    mkdirSync(join(tmpWorkspace, '.loci', 'tickets'), { recursive: true })
    expect(() => patchTicket('TST-999', { progress: 10 }, tmpWorkspace)).toThrow('Ticket "TST-999" not found')
  })

  it('returns the updated ticket', () => {
    seedTicket(tmpWorkspace)
    const result = patchTicket('TST-001', { assignee: 'human' }, tmpWorkspace)
    expect(result.assignee).toBe('human')
  })
})
