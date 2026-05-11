import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

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
  writeFileSync(join(ticketDir, 'ticket.json'), JSON.stringify({ id }, null, 2))
  writeFileSync(join(ticketDir, 'description.md'), '# TST-001\n\nInitial description.')
}

import { readDoc, writeDoc } from '../commands/doc'

describe('readDoc', () => {
  beforeEach(setupEnv)
  afterEach(teardownEnv)

  it('returns file content', () => {
    seedTicket(tmpWorkspace)
    expect(readDoc('TST-001', 'description.md', tmpWorkspace)).toBe('# TST-001\n\nInitial description.')
  })

  it('throws when ticket not found', () => {
    mkdirSync(join(tmpWorkspace, '.loci', 'tickets'), { recursive: true })
    expect(() => readDoc('TST-999', 'description.md', tmpWorkspace)).toThrow('Ticket "TST-999" not found')
  })

  it('throws when doc file not found', () => {
    seedTicket(tmpWorkspace)
    expect(() => readDoc('TST-001', 'nonexistent.md', tmpWorkspace)).toThrow('Doc file "nonexistent.md" not found in ticket TST-001')
  })
})

describe('writeDoc', () => {
  beforeEach(setupEnv)
  afterEach(teardownEnv)

  it('writes content to existing doc', () => {
    seedTicket(tmpWorkspace)
    writeDoc('TST-001', 'description.md', '# Updated\n\nNew content.', tmpWorkspace)
    const content = readFileSync(join(tmpWorkspace, '.loci', 'tickets', 'TST-001', 'description.md'), 'utf8')
    expect(content).toBe('# Updated\n\nNew content.')
  })

  it('creates a new doc file if it does not exist', () => {
    seedTicket(tmpWorkspace)
    writeDoc('TST-001', 'design.md', '# Design', tmpWorkspace)
    expect(existsSync(join(tmpWorkspace, '.loci', 'tickets', 'TST-001', 'design.md'))).toBe(true)
  })

  it('throws when ticket not found', () => {
    mkdirSync(join(tmpWorkspace, '.loci', 'tickets'), { recursive: true })
    expect(() => writeDoc('TST-999', 'description.md', 'content', tmpWorkspace)).toThrow('Ticket "TST-999" not found')
  })
})
