import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs'
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

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'TST-001',
    title: 'Test ticket',
    status: 'todo',
    priority: 'medium',
    labels: [],
    assignee: null,
    progress: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function seedWorkspace(root: string) {
  mkdirSync(join(root, '.loci', 'tickets'), { recursive: true })
  writeFileSync(
    join(root, '.loci', 'project.json'),
    JSON.stringify({ id: 'proj-uuid', name: 'Test', prefix: 'TST', nextId: 1, createdAt: '2026-01-01T00:00:00.000Z' }, null, 2)
  )
}

function seedRegistry(home: string, entries: Array<{ id: string; name: string; prefix: string; path: string }>) {
  mkdirSync(join(home, '.loci'), { recursive: true })
  writeFileSync(join(home, '.loci', 'registry.json'), JSON.stringify({ projects: entries }, null, 2))
}

import {
  readRegistry,
  findRegistryEntry,
  readProject,
  listTickets,
  readTicketWithDocs,
  writeTicket,
  createTicket,
  readTicketDoc,
  writeTicketDoc,
  readAttachments,
  writeAttachments,
} from '../data'

describe('readRegistry', () => {
  beforeEach(setupEnv)
  afterEach(teardownEnv)

  it('returns empty registry when file is missing', () => {
    expect(readRegistry().projects).toEqual([])
  })

  it('reads registry from HOME', () => {
    seedRegistry(tmpHome, [{ id: 'abc', name: 'Foo', prefix: 'FOO', path: '/foo' }])
    expect(readRegistry().projects).toHaveLength(1)
  })
})

describe('findRegistryEntry', () => {
  beforeEach(setupEnv)
  afterEach(teardownEnv)

  it('returns entry when found', () => {
    seedRegistry(tmpHome, [{ id: 'abc', name: 'Foo', prefix: 'FOO', path: '/foo' }])
    const entry = findRegistryEntry('abc')
    expect(entry?.prefix).toBe('FOO')
  })

  it('returns null for unknown id', () => {
    seedRegistry(tmpHome, [])
    expect(findRegistryEntry('unknown')).toBeNull()
  })
})

describe('readProject', () => {
  beforeEach(setupEnv)
  afterEach(teardownEnv)

  it('reads project.json from workspace', () => {
    seedWorkspace(tmpWorkspace)
    const proj = readProject(tmpWorkspace)
    expect(proj.prefix).toBe('TST')
    expect(proj.nextId).toBe(1)
  })
})

describe('createTicket / listTickets', () => {
  beforeEach(setupEnv)
  afterEach(teardownEnv)

  it('creates ticket directory and files', () => {
    seedWorkspace(tmpWorkspace)
    const ticket = makeTicket()
    createTicket(tmpWorkspace, ticket)

    const tickets = listTickets(tmpWorkspace)
    expect(tickets).toHaveLength(1)
    expect(tickets[0].id).toBe('TST-001')
  })

  it('listTickets returns empty array when tickets dir is missing', () => {
    // workspace without tickets dir
    mkdirSync(join(tmpWorkspace, '.loci'), { recursive: true })
    expect(listTickets(tmpWorkspace)).toEqual([])
  })

  it('listTickets skips non-directory entries', () => {
    seedWorkspace(tmpWorkspace)
    // Create a stray file in tickets dir
    writeFileSync(join(tmpWorkspace, '.loci', 'tickets', 'stray.txt'), 'noise')
    expect(listTickets(tmpWorkspace)).toEqual([])
  })

  it('creates description.md and attachments.json automatically', () => {
    seedWorkspace(tmpWorkspace)
    createTicket(tmpWorkspace, makeTicket())
    const desc = readTicketDoc(tmpWorkspace, 'TST-001', 'description.md')
    expect(desc).toContain('Test ticket')
    const att = readAttachments(tmpWorkspace, 'TST-001')
    expect(att).toEqual([])
  })
})

describe('writeTicket / readTicketWithDocs', () => {
  beforeEach(setupEnv)
  afterEach(teardownEnv)

  it('writeTicket persists changes', () => {
    seedWorkspace(tmpWorkspace)
    createTicket(tmpWorkspace, makeTicket())
    const updated = makeTicket({ status: 'done', progress: 100 })
    writeTicket(tmpWorkspace, updated)

    const result = readTicketWithDocs(tmpWorkspace, 'TST-001')
    expect(result?.status).toBe('done')
    expect(result?.progress).toBe(100)
  })

  it('readTicketWithDocs returns null for unknown ticket', () => {
    seedWorkspace(tmpWorkspace)
    expect(readTicketWithDocs(tmpWorkspace, 'TST-999')).toBeNull()
  })

  it('readTicketWithDocs includes list of .md docs', () => {
    seedWorkspace(tmpWorkspace)
    createTicket(tmpWorkspace, makeTicket())
    writeTicketDoc(tmpWorkspace, 'TST-001', 'implementation_plan.md', '# Plan\n')

    const result = readTicketWithDocs(tmpWorkspace, 'TST-001')
    expect(result?.docs).toContain('description.md')
    expect(result?.docs).toContain('implementation_plan.md')
    expect(result?.docs).not.toContain('attachments.json') // not a .md file
  })
})

describe('readTicketDoc / writeTicketDoc', () => {
  beforeEach(setupEnv)
  afterEach(teardownEnv)

  it('round-trips doc content', () => {
    seedWorkspace(tmpWorkspace)
    createTicket(tmpWorkspace, makeTicket())
    writeTicketDoc(tmpWorkspace, 'TST-001', 'summary.md', '# Done\nAll good.')
    expect(readTicketDoc(tmpWorkspace, 'TST-001', 'summary.md')).toBe('# Done\nAll good.')
  })

  it('returns null for missing doc', () => {
    seedWorkspace(tmpWorkspace)
    createTicket(tmpWorkspace, makeTicket())
    expect(readTicketDoc(tmpWorkspace, 'TST-001', 'nonexistent.md')).toBeNull()
  })
})

describe('readAttachments / writeAttachments', () => {
  beforeEach(setupEnv)
  afterEach(teardownEnv)

  it('round-trips attachment list', () => {
    seedWorkspace(tmpWorkspace)
    createTicket(tmpWorkspace, makeTicket())
    writeAttachments(tmpWorkspace, 'TST-001', ['file-a.png', 'file-b.pdf'])
    expect(readAttachments(tmpWorkspace, 'TST-001')).toEqual(['file-a.png', 'file-b.pdf'])
  })

  it('returns empty array when attachments.json is missing', () => {
    seedWorkspace(tmpWorkspace)
    // Create ticket dir without attachments.json
    mkdirSync(join(tmpWorkspace, '.loci', 'tickets', 'TST-001'), { recursive: true })
    expect(readAttachments(tmpWorkspace, 'TST-001')).toEqual([])
  })
})
