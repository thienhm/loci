import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import type { Ticket } from '@loci/shared'
import { createMcpServer } from '../mcp'

let tmpHome: string
let tmpWorkspace: string

const PROJECT_ID = 'mcp-test-project-uuid'
const PROJECT_PREFIX = 'MCP'

function makeTicket(overrides: Partial<Ticket> = {}): Ticket {
  return {
    id: 'MCP-001',
    title: 'Test ticket',
    status: 'todo',
    priority: 'medium',
    labels: [],
    assignee: null,
    progress: 0,
    archived: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function seedTicket(id: string, overrides: Partial<Ticket> = {}) {
  const dir = join(tmpWorkspace, '.loci', 'tickets', id)
  mkdirSync(dir, { recursive: true })
  const ticket = makeTicket({ id, ...overrides })
  writeFileSync(join(dir, 'ticket.json'), JSON.stringify(ticket, null, 2))
  writeFileSync(join(dir, 'description.md'), `# ${ticket.title}\n\n`)
  writeFileSync(join(dir, 'attachments.json'), JSON.stringify([], null, 2))
  return ticket
}

async function buildClient() {
  const mcpServer = createMcpServer()
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()

  await mcpServer.connect(serverTransport)

  const client = new Client({ name: 'test-client', version: '1.0.0' })
  await client.connect(clientTransport)

  return { client, mcpServer }
}

function callTool(client: Client, name: string, args?: Record<string, unknown>) {
  return client.callTool({ name, arguments: args ?? {} })
}

function parseResult(result: Awaited<ReturnType<Client['callTool']>>) {
  const content = result.content as Array<{ type: string; text: string }>
  return JSON.parse(content[0].text)
}

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'loci-mcp-home-'))
  tmpWorkspace = mkdtempSync(join(tmpdir(), 'loci-mcp-ws-'))
  process.env.HOME = tmpHome

  // Seed registry
  mkdirSync(join(tmpHome, '.loci'), { recursive: true })
  writeFileSync(
    join(tmpHome, '.loci', 'registry.json'),
    JSON.stringify({
      projects: [{ id: PROJECT_ID, name: 'McpTest', prefix: PROJECT_PREFIX, path: tmpWorkspace }],
    }, null, 2)
  )

  // Seed project
  mkdirSync(join(tmpWorkspace, '.loci', 'tickets'), { recursive: true })
  writeFileSync(
    join(tmpWorkspace, '.loci', 'project.json'),
    JSON.stringify({ id: PROJECT_ID, name: 'McpTest', prefix: PROJECT_PREFIX, nextId: 1, createdAt: '2026-01-01T00:00:00.000Z' }, null, 2)
  )
})

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true })
  rmSync(tmpWorkspace, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// list_projects
// ---------------------------------------------------------------------------

describe('list_projects', () => {
  it('returns all registered projects', async () => {
    const { client } = await buildClient()
    const result = parseResult(await callTool(client, 'list_projects'))
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(1)
    expect(result[0].prefix).toBe(PROJECT_PREFIX)
  })
})

// ---------------------------------------------------------------------------
// list_tickets
// ---------------------------------------------------------------------------

describe('list_tickets', () => {
  it('returns all tickets across projects when no project_id given', async () => {
    seedTicket('MCP-001')
    seedTicket('MCP-002', { status: 'done' })
    const { client } = await buildClient()
    const result = parseResult(await callTool(client, 'list_tickets'))
    expect(result).toHaveLength(2)
  })

  it('filters by project_id', async () => {
    seedTicket('MCP-001')
    const { client } = await buildClient()
    const result = parseResult(await callTool(client, 'list_tickets', { project_id: PROJECT_ID }))
    expect(result).toHaveLength(1)
  })

  it('filters by status', async () => {
    seedTicket('MCP-001', { status: 'todo' })
    seedTicket('MCP-002', { status: 'done' })
    const { client } = await buildClient()
    const result = parseResult(await callTool(client, 'list_tickets', { status: 'done' }))
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('MCP-002')
  })

  it('filters by assignee', async () => {
    seedTicket('MCP-001', { assignee: 'agent:claude' })
    seedTicket('MCP-002', { assignee: null })
    const { client } = await buildClient()
    const result = parseResult(await callTool(client, 'list_tickets', { assignee: 'agent:claude' }))
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('MCP-001')
  })
})

// ---------------------------------------------------------------------------
// get_ticket
// ---------------------------------------------------------------------------

describe('get_ticket', () => {
  it('returns ticket with all doc contents', async () => {
    seedTicket('MCP-001')
    const { client } = await buildClient()
    const result = parseResult(await callTool(client, 'get_ticket', { id: 'MCP-001' }))
    expect(result.id).toBe('MCP-001')
    expect(result.title).toBe('Test ticket')
    expect(result.docs).toBeDefined()
    expect(result.docs['description.md']).toContain('Test ticket')
  })

  it('returns error for unknown ticket', async () => {
    const { client } = await buildClient()
    const raw = await callTool(client, 'get_ticket', { id: 'MCP-999' })
    expect(raw.isError).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// create_ticket
// ---------------------------------------------------------------------------

describe('create_ticket', () => {
  it('creates ticket in first project and returns it', async () => {
    const { client } = await buildClient()
    const result = parseResult(await callTool(client, 'create_ticket', { title: 'New from MCP' }))
    expect(result.id).toBe('MCP-001')
    expect(result.title).toBe('New from MCP')
    expect(result.status).toBe('todo')
  })

  it('respects optional fields', async () => {
    const { client } = await buildClient()
    const result = parseResult(await callTool(client, 'create_ticket', {
      title: 'Prio ticket',
      priority: 'high',
      labels: ['bug'],
      assignee: 'human',
    }))
    expect(result.priority).toBe('high')
    expect(result.labels).toEqual(['bug'])
    expect(result.assignee).toBe('human')
  })

  it('creates ticket in the specified project when project_id is given', async () => {
    const secondWorkspace = mkdtempSync(join(tmpdir(), 'loci-mcp-ws2-'))
    const SECOND_ID = 'second-project-uuid'
    const SECOND_PREFIX = 'SEC'

    // Register both projects
    writeFileSync(
      join(tmpHome, '.loci', 'registry.json'),
      JSON.stringify({
        projects: [
          { id: PROJECT_ID, name: 'McpTest', prefix: PROJECT_PREFIX, path: tmpWorkspace },
          { id: SECOND_ID, name: 'SecondProject', prefix: SECOND_PREFIX, path: secondWorkspace },
        ],
      }, null, 2)
    )
    mkdirSync(join(secondWorkspace, '.loci', 'tickets'), { recursive: true })
    writeFileSync(
      join(secondWorkspace, '.loci', 'project.json'),
      JSON.stringify({ id: SECOND_ID, name: 'SecondProject', prefix: SECOND_PREFIX, nextId: 1, createdAt: '2026-01-01T00:00:00.000Z' }, null, 2)
    )

    try {
      const { client } = await buildClient()
      const result = parseResult(await callTool(client, 'create_ticket', {
        title: 'Ticket in second project',
        project_id: SECOND_ID,
      }))
      expect(result.id).toBe('SEC-001')
      expect(result.title).toBe('Ticket in second project')
    } finally {
      rmSync(secondWorkspace, { recursive: true, force: true })
    }
  })

  it('returns error when project_id does not match any project', async () => {
    const { client } = await buildClient()
    const raw = await callTool(client, 'create_ticket', {
      title: 'Bad project',
      project_id: 'nonexistent-uuid',
    })
    expect(raw.isError).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// update_ticket
// ---------------------------------------------------------------------------

describe('update_ticket', () => {
  it('updates ticket fields and returns updated ticket', async () => {
    seedTicket('MCP-001')
    const { client } = await buildClient()
    const result = parseResult(await callTool(client, 'update_ticket', {
      id: 'MCP-001',
      fields: { status: 'in_progress', progress: 50 },
    }))
    expect(result.status).toBe('in_progress')
    expect(result.progress).toBe(50)
  })

  it('returns error for unknown ticket', async () => {
    const { client } = await buildClient()
    const raw = await callTool(client, 'update_ticket', { id: 'MCP-999', fields: { status: 'done' } })
    expect(raw.isError).toBe(true)
  })

  it('rejects setting status to done without summary.md', async () => {
    seedTicket('MCP-001')
    const { client } = await buildClient()
    const raw = await callTool(client, 'update_ticket', { id: 'MCP-001', fields: { status: 'done' } })
    expect(raw.isError).toBe(true)
    const text = (raw.content as Array<{ type: string; text: string }>)[0].text
    expect(text).toContain('summary.md')
  })

  it('allows setting status to done when summary.md exists', async () => {
    seedTicket('MCP-001')
    const { client } = await buildClient()
    await callTool(client, 'write_ticket_doc', { id: 'MCP-001', filename: 'summary.md', content: '# Done' })
    const result = parseResult(await callTool(client, 'update_ticket', { id: 'MCP-001', fields: { status: 'done' } }))
    expect(result.status).toBe('done')
  })
})

// ---------------------------------------------------------------------------
// read_ticket_doc
// ---------------------------------------------------------------------------

describe('read_ticket_doc', () => {
  it('returns doc content', async () => {
    seedTicket('MCP-001')
    const { client } = await buildClient()
    const result = await callTool(client, 'read_ticket_doc', { id: 'MCP-001', filename: 'description.md' })
    const content = (result.content as Array<{ type: string; text: string }>)[0].text
    expect(content).toContain('Test ticket')
  })

  it('returns error for missing doc', async () => {
    seedTicket('MCP-001')
    const { client } = await buildClient()
    const raw = await callTool(client, 'read_ticket_doc', { id: 'MCP-001', filename: 'missing.md' })
    expect(raw.isError).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// write_ticket_doc
// ---------------------------------------------------------------------------

describe('write_ticket_doc', () => {
  it('writes doc and can be read back', async () => {
    seedTicket('MCP-001')
    const { client } = await buildClient()

    await callTool(client, 'write_ticket_doc', {
      id: 'MCP-001',
      filename: 'summary.md',
      content: '# Done\nAll good.',
    })

    const readResult = await callTool(client, 'read_ticket_doc', { id: 'MCP-001', filename: 'summary.md' })
    const text = (readResult.content as Array<{ type: string; text: string }>)[0].text
    expect(text).toBe('# Done\nAll good.')
  })

  it('rejects non-.md filenames', async () => {
    seedTicket('MCP-001')
    const { client } = await buildClient()
    const raw = await callTool(client, 'write_ticket_doc', {
      id: 'MCP-001',
      filename: 'script.js',
      content: 'bad',
    })
    expect(raw.isError).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// list_tickets — archived filter
// ---------------------------------------------------------------------------

describe('list_tickets — archived filter', () => {
  it('excludes archived tickets by default', async () => {
    seedTicket('MCP-001', { archived: false })
    seedTicket('MCP-002', { archived: true })
    const { client } = await buildClient()
    const result = parseResult(await callTool(client, 'list_tickets'))
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('MCP-001')
  })

  it('returns only archived tickets when archived=true', async () => {
    seedTicket('MCP-001', { archived: false })
    seedTicket('MCP-002', { archived: true })
    const { client } = await buildClient()
    const result = parseResult(await callTool(client, 'list_tickets', { archived: true }))
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('MCP-002')
  })

  it('returns only non-archived tickets when archived=false', async () => {
    seedTicket('MCP-001', { archived: false })
    seedTicket('MCP-002', { archived: true })
    const { client } = await buildClient()
    const result = parseResult(await callTool(client, 'list_tickets', { archived: false }))
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('MCP-001')
  })
})

// ---------------------------------------------------------------------------
// list_attachments
// ---------------------------------------------------------------------------

describe('list_attachments', () => {
  it('returns empty array for new ticket', async () => {
    seedTicket('MCP-001')
    const { client } = await buildClient()
    const result = parseResult(await callTool(client, 'list_attachments', { id: 'MCP-001' }))
    expect(result).toEqual([])
  })

  it('returns seeded attachments', async () => {
    seedTicket('MCP-001')
    // Seed attachments
    const dir = join(tmpWorkspace, '.loci', 'tickets', 'MCP-001')
    writeFileSync(join(dir, 'attachments.json'), JSON.stringify(['file1.png', 'file2.pdf'], null, 2))
    const { client } = await buildClient()
    const result = parseResult(await callTool(client, 'list_attachments', { id: 'MCP-001' }))
    expect(result).toEqual(['file1.png', 'file2.pdf'])
  })

  it('returns error for unknown ticket', async () => {
    const { client } = await buildClient()
    const raw = await callTool(client, 'list_attachments', { id: 'MCP-999' })
    expect(raw.isError).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// update_attachments
// ---------------------------------------------------------------------------

describe('update_attachments', () => {
  it('writes attachments and can be read back', async () => {
    seedTicket('MCP-001')
    const { client } = await buildClient()

    await callTool(client, 'update_attachments', {
      id: 'MCP-001',
      attachments: ['report.pdf', 'screenshot.png'],
    })

    const result = parseResult(await callTool(client, 'list_attachments', { id: 'MCP-001' }))
    expect(result).toEqual(['report.pdf', 'screenshot.png'])
  })

  it('returns error for unknown ticket', async () => {
    const { client } = await buildClient()
    const raw = await callTool(client, 'update_attachments', {
      id: 'MCP-999',
      attachments: ['file.png'],
    })
    expect(raw.isError).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// list_files
// ---------------------------------------------------------------------------

describe('list_files', () => {
  it('returns empty array when no files uploaded', async () => {
    seedTicket('MCP-001')
    const { client } = await buildClient()
    const result = parseResult(await callTool(client, 'list_files', { id: 'MCP-001' }))
    expect(result).toEqual([])
  })

  it('returns file info for uploaded files', async () => {
    seedTicket('MCP-001')
    // Seed a file
    const filesDir = join(tmpWorkspace, '.loci', 'tickets', 'MCP-001', 'files')
    mkdirSync(filesDir, { recursive: true })
    writeFileSync(join(filesDir, 'test.png'), Buffer.from('fake-png-data'))
    const { client } = await buildClient()
    const result = parseResult(await callTool(client, 'list_files', { id: 'MCP-001' }))
    expect(result).toHaveLength(1)
    expect(result[0].name).toBe('test.png')
    expect(result[0].mimeType).toBe('image/png')
    expect(result[0].size).toBeGreaterThan(0)
  })

  it('returns error for unknown ticket', async () => {
    const { client } = await buildClient()
    const raw = await callTool(client, 'list_files', { id: 'MCP-999' })
    expect(raw.isError).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// delete_file
// ---------------------------------------------------------------------------

describe('delete_file', () => {
  it('deletes an existing file', async () => {
    seedTicket('MCP-001')
    const filesDir = join(tmpWorkspace, '.loci', 'tickets', 'MCP-001', 'files')
    mkdirSync(filesDir, { recursive: true })
    writeFileSync(join(filesDir, 'to-delete.txt'), 'content')

    const { client } = await buildClient()
    const raw = await callTool(client, 'delete_file', { id: 'MCP-001', filename: 'to-delete.txt' })
    expect(raw.isError).toBeFalsy()

    // Verify file is gone
    expect(existsSync(join(filesDir, 'to-delete.txt'))).toBe(false)
  })

  it('returns error for non-existent file', async () => {
    seedTicket('MCP-001')
    const { client } = await buildClient()
    const raw = await callTool(client, 'delete_file', { id: 'MCP-001', filename: 'missing.txt' })
    expect(raw.isError).toBe(true)
  })

  it('returns error for unknown ticket', async () => {
    const { client } = await buildClient()
    const raw = await callTool(client, 'delete_file', { id: 'MCP-999', filename: 'file.txt' })
    expect(raw.isError).toBe(true)
  })
})
