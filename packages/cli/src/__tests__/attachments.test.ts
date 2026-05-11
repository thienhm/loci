import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs'
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

function seedTicket(root: string, id = 'TST-001', attachments: string[] = []) {
  const ticketDir = join(root, '.loci', 'tickets', id)
  mkdirSync(ticketDir, { recursive: true })
  writeFileSync(join(ticketDir, 'ticket.json'), JSON.stringify({ id }, null, 2))
  writeFileSync(join(ticketDir, 'attachments.json'), JSON.stringify(attachments, null, 2))
}

import { listAttachments } from '../commands/attachments'

describe('listAttachments', () => {
  beforeEach(setupEnv)
  afterEach(teardownEnv)

  it('returns empty array when no attachments', () => {
    seedTicket(tmpWorkspace)
    expect(listAttachments('TST-001', tmpWorkspace)).toEqual([])
  })

  it('returns attachment filenames', () => {
    seedTicket(tmpWorkspace, 'TST-001', ['screenshot.png', 'spec.pdf'])
    expect(listAttachments('TST-001', tmpWorkspace)).toEqual(['screenshot.png', 'spec.pdf'])
  })

  it('throws when ticket not found', () => {
    mkdirSync(join(tmpWorkspace, '.loci', 'tickets'), { recursive: true })
    expect(() => listAttachments('TST-999', tmpWorkspace)).toThrow('Ticket "TST-999" not found')
  })
})
