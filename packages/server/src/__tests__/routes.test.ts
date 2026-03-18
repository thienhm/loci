import { describe, it, expect, beforeEach, afterEach, beforeAll } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import { registerRoutes } from '../routes'
import type { Ticket } from '@loci/shared'

let tmpHome: string
let tmpWorkspace: string
let app: FastifyInstance

const PROJECT_ID = 'test-project-uuid'
const PROJECT_PREFIX = 'TST'

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

function seedTicket(id: string, overrides: Partial<Ticket> = {}) {
  const dir = join(tmpWorkspace, '.loci', 'tickets', id)
  mkdirSync(dir, { recursive: true })
  const ticket = makeTicket({ id, ...overrides })
  writeFileSync(join(dir, 'ticket.json'), JSON.stringify(ticket, null, 2))
  writeFileSync(join(dir, 'description.md'), `# ${ticket.title}\n\n`)
  writeFileSync(join(dir, 'attachments.json'), JSON.stringify([], null, 2))
  return ticket
}

async function buildApp() {
  const instance = Fastify({ logger: false })
  await instance.register(cors, { origin: true })
  await instance.register(multipart)
  instance.addContentTypeParser('text/plain', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body)
  })
  await registerRoutes(instance)
  instance.get('/', async (_req, reply) => reply.send('ok'))
  instance.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: 'Not found' }))
  await instance.ready()
  return instance
}

beforeEach(async () => {
  // Fresh isolated HOME and workspace for each test
  tmpHome = mkdtempSync(join(tmpdir(), 'loci-routes-home-'))
  tmpWorkspace = mkdtempSync(join(tmpdir(), 'loci-routes-ws-'))
  process.env.HOME = tmpHome

  // Seed registry
  mkdirSync(join(tmpHome, '.loci'), { recursive: true })
  writeFileSync(
    join(tmpHome, '.loci', 'registry.json'),
    JSON.stringify({
      projects: [{ id: PROJECT_ID, name: 'Test', prefix: PROJECT_PREFIX, path: tmpWorkspace }],
    }, null, 2)
  )

  // Seed project
  mkdirSync(join(tmpWorkspace, '.loci', 'tickets'), { recursive: true })
  writeFileSync(
    join(tmpWorkspace, '.loci', 'project.json'),
    JSON.stringify({ id: PROJECT_ID, name: 'Test', prefix: PROJECT_PREFIX, nextId: 1, createdAt: '2026-01-01T00:00:00.000Z' }, null, 2)
  )

  app = await buildApp()
})

afterEach(async () => {
  await app.close()
  rmSync(tmpHome, { recursive: true, force: true })
  rmSync(tmpWorkspace, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// GET /api/projects
// ---------------------------------------------------------------------------

describe('GET /api/projects', () => {
  it('returns all registered projects', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/projects' })
    expect(res.statusCode).toBe(200)
    const body = res.json<any[]>()
    expect(body).toHaveLength(1)
    expect(body[0].prefix).toBe(PROJECT_PREFIX)
  })
})

// ---------------------------------------------------------------------------
// GET /api/projects/:projectId
// ---------------------------------------------------------------------------

describe('GET /api/projects/:projectId', () => {
  it('returns project metadata', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/projects/${PROJECT_ID}` })
    expect(res.statusCode).toBe(200)
    expect(res.json<any>().prefix).toBe(PROJECT_PREFIX)
  })

  it('returns 404 for unknown project', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/projects/unknown-uuid' })
    expect(res.statusCode).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// GET /api/projects/:projectId/tickets
// ---------------------------------------------------------------------------

describe('GET /api/projects/:projectId/tickets', () => {
  it('returns all tickets', async () => {
    seedTicket('TST-001')
    seedTicket('TST-002', { status: 'done' })
    const res = await app.inject({ method: 'GET', url: `/api/projects/${PROJECT_ID}/tickets` })
    expect(res.statusCode).toBe(200)
    expect(res.json<any[]>()).toHaveLength(2)
  })

  it('filters by status', async () => {
    seedTicket('TST-001', { status: 'todo' })
    seedTicket('TST-002', { status: 'done' })
    const res = await app.inject({ method: 'GET', url: `/api/projects/${PROJECT_ID}/tickets?status=done` })
    const body = res.json<any[]>()
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe('TST-002')
  })

  it('filters by assignee', async () => {
    seedTicket('TST-001', { assignee: 'agent:claude' })
    seedTicket('TST-002', { assignee: null })
    const res = await app.inject({ method: 'GET', url: `/api/projects/${PROJECT_ID}/tickets?assignee=agent:claude` })
    const body = res.json<any[]>()
    expect(body).toHaveLength(1)
    expect(body[0].id).toBe('TST-001')
  })

  it('returns 404 for unknown project', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/projects/bad/tickets' })
    expect(res.statusCode).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// POST /api/projects/:projectId/tickets
// ---------------------------------------------------------------------------

describe('POST /api/projects/:projectId/tickets', () => {
  it('creates ticket with auto-incremented ID', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${PROJECT_ID}/tickets`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'New ticket' }),
    })
    expect(res.statusCode).toBe(201)
    const body = res.json<any>()
    expect(body.id).toBe('TST-001')
    expect(body.title).toBe('New ticket')
    expect(body.status).toBe('todo')
  })

  it('respects optional fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/api/projects/${PROJECT_ID}/tickets`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'High prio', priority: 'high', labels: ['bug'], assignee: 'human' }),
    })
    const body = res.json<any>()
    expect(body.priority).toBe('high')
    expect(body.labels).toEqual(['bug'])
    expect(body.assignee).toBe('human')
  })

  it('increments nextId in project.json', async () => {
    await app.inject({
      method: 'POST',
      url: `/api/projects/${PROJECT_ID}/tickets`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'First' }),
    })
    const second = await app.inject({
      method: 'POST',
      url: `/api/projects/${PROJECT_ID}/tickets`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Second' }),
    })
    expect(second.json<any>().id).toBe('TST-002')
  })
})

// ---------------------------------------------------------------------------
// GET /api/projects/:projectId/tickets/:ticketId
// ---------------------------------------------------------------------------

describe('GET /api/projects/:projectId/tickets/:ticketId', () => {
  it('returns ticket with docs map', async () => {
    seedTicket('TST-001')
    const res = await app.inject({ method: 'GET', url: `/api/projects/${PROJECT_ID}/tickets/TST-001` })
    expect(res.statusCode).toBe(200)
    const body = res.json<any>()
    expect(body.id).toBe('TST-001')
    expect(body.docs['description.md']).toBeDefined()
    expect(body.docs['description.md']).toContain('Test ticket')
  })

  it('returns 404 for unknown ticket', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/projects/${PROJECT_ID}/tickets/TST-999` })
    expect(res.statusCode).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// PATCH /api/projects/:projectId/tickets/:ticketId
// ---------------------------------------------------------------------------

describe('PATCH /api/projects/:projectId/tickets/:ticketId', () => {
  it('updates ticket fields and refreshes updatedAt', async () => {
    seedTicket('TST-001')
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${PROJECT_ID}/tickets/TST-001`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'in_progress', progress: 50 }),
    })
    expect(res.statusCode).toBe(200)
    const body = res.json<any>()
    expect(body.status).toBe('in_progress')
    expect(body.progress).toBe(50)
    expect(body.updatedAt).not.toBe('2026-01-01T00:00:00.000Z')
  })

  it('cannot overwrite id or createdAt', async () => {
    seedTicket('TST-001')
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${PROJECT_ID}/tickets/TST-001`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: 'HACK-999', createdAt: '1970-01-01T00:00:00.000Z' }),
    })
    const body = res.json<any>()
    expect(body.id).toBe('TST-001')
    expect(body.createdAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('returns 404 for unknown ticket', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/api/projects/${PROJECT_ID}/tickets/TST-999`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'done' }),
    })
    expect(res.statusCode).toBe(404)
  })
})

// ---------------------------------------------------------------------------
// GET/PUT /api/projects/:projectId/tickets/:ticketId/docs/:filename
// ---------------------------------------------------------------------------

describe('docs endpoints', () => {
  it('GET returns existing doc content', async () => {
    seedTicket('TST-001')
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${PROJECT_ID}/tickets/TST-001/docs/description.md`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('Test ticket')
  })

  it('GET returns 404 for missing doc', async () => {
    seedTicket('TST-001')
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${PROJECT_ID}/tickets/TST-001/docs/missing.md`,
    })
    expect(res.statusCode).toBe(404)
  })

  it('PUT writes doc and returns 204', async () => {
    seedTicket('TST-001')
    const put = await app.inject({
      method: 'PUT',
      url: `/api/projects/${PROJECT_ID}/tickets/TST-001/docs/summary.md`,
      headers: { 'content-type': 'text/plain' },
      body: '# Done\nAll good.',
    })
    expect(put.statusCode).toBe(204)

    const get = await app.inject({
      method: 'GET',
      url: `/api/projects/${PROJECT_ID}/tickets/TST-001/docs/summary.md`,
    })
    expect(get.body).toBe('# Done\nAll good.')
  })

  it('PUT rejects non-.md filenames', async () => {
    seedTicket('TST-001')
    const res = await app.inject({
      method: 'PUT',
      url: `/api/projects/${PROJECT_ID}/tickets/TST-001/docs/script.js`,
      headers: { 'content-type': 'text/plain' },
      body: 'bad',
    })
    expect(res.statusCode).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// GET/PUT /api/projects/:projectId/tickets/:ticketId/attachments
// ---------------------------------------------------------------------------

describe('attachments endpoints', () => {
  it('GET returns attachment list', async () => {
    seedTicket('TST-001')
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${PROJECT_ID}/tickets/TST-001/attachments`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json<any[]>()).toEqual([])
  })

  it('PUT stores attachments and GET returns them', async () => {
    seedTicket('TST-001')
    await app.inject({
      method: 'PUT',
      url: `/api/projects/${PROJECT_ID}/tickets/TST-001/attachments`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(['img.png', 'doc.pdf']),
    })
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${PROJECT_ID}/tickets/TST-001/attachments`,
    })
    expect(res.json<any[]>()).toEqual(['img.png', 'doc.pdf'])
  })

  it('PUT rejects non-array body', async () => {
    seedTicket('TST-001')
    const res = await app.inject({
      method: 'PUT',
      url: `/api/projects/${PROJECT_ID}/tickets/TST-001/attachments`,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bad: true }),
    })
    expect(res.statusCode).toBe(400)
  })
})

// ---------------------------------------------------------------------------
// File upload endpoints
// ---------------------------------------------------------------------------

describe('file upload endpoints', () => {
  const BASE = (ticketId: string) => `/api/projects/${PROJECT_ID}/tickets/${ticketId}/files`

  function multipartBody(filename: string, contentType: string, fileContent: string) {
    const boundary = '----FormBoundary'
    const body = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="${filename}"`,
      `Content-Type: ${contentType}`,
      '',
      fileContent,
      `--${boundary}--`,
    ].join('\r\n')
    return { body, boundary }
  }

  it('POST uploads a file and GET lists it', async () => {
    seedTicket('TST-001')
    const { body, boundary } = multipartBody('screenshot.png', 'image/png', 'fake-png-data')

    const postRes = await app.inject({
      method: 'POST',
      url: BASE('TST-001'),
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      body,
    })
    expect(postRes.statusCode).toBe(201)
    expect(postRes.json<any>().name).toBe('screenshot.png')

    const listRes = await app.inject({ method: 'GET', url: BASE('TST-001') })
    expect(listRes.statusCode).toBe(200)
    const files = listRes.json<any[]>()
    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('screenshot.png')
    expect(files[0].mimeType).toBe('image/png')
  })

  it('GET /files/:filename serves the file', async () => {
    seedTicket('TST-001')
    const filesDir = join(tmpWorkspace, '.loci', 'tickets', 'TST-001', 'files')
    mkdirSync(filesDir, { recursive: true })
    writeFileSync(join(filesDir, 'hello.txt'), 'hello world')

    const res = await app.inject({
      method: 'GET',
      url: `${BASE('TST-001')}/hello.txt`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('hello world')
  })

  it('GET /files/:filename returns 404 for missing file', async () => {
    seedTicket('TST-001')
    const res = await app.inject({
      method: 'GET',
      url: `${BASE('TST-001')}/nope.txt`,
    })
    expect(res.statusCode).toBe(404)
  })

  it('DELETE /files/:filename removes the file', async () => {
    seedTicket('TST-001')
    const filesDir = join(tmpWorkspace, '.loci', 'tickets', 'TST-001', 'files')
    mkdirSync(filesDir, { recursive: true })
    writeFileSync(join(filesDir, 'remove-me.txt'), 'bye')

    const delRes = await app.inject({
      method: 'DELETE',
      url: `${BASE('TST-001')}/remove-me.txt`,
    })
    expect(delRes.statusCode).toBe(204)
    expect(existsSync(join(filesDir, 'remove-me.txt'))).toBe(false)
  })

  it('POST handles filename collision by appending counter', async () => {
    seedTicket('TST-001')
    const filesDir = join(tmpWorkspace, '.loci', 'tickets', 'TST-001', 'files')
    mkdirSync(filesDir, { recursive: true })
    writeFileSync(join(filesDir, 'report.pdf'), 'existing')

    const { body, boundary } = multipartBody('report.pdf', 'application/pdf', 'new-content')
    const res = await app.inject({
      method: 'POST',
      url: BASE('TST-001'),
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      body,
    })
    expect(res.statusCode).toBe(201)
    expect(res.json<any>().name).toBe('report(1).pdf')
    expect(existsSync(join(filesDir, 'report(1).pdf'))).toBe(true)
  })

  it('POST saves .md uploads as ticket docs', async () => {
    seedTicket('TST-001')
    const { body, boundary } = multipartBody('notes.md', 'text/markdown', '# My Notes\n\nSome content.')

    const res = await app.inject({
      method: 'POST',
      url: BASE('TST-001'),
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      body,
    })
    expect(res.statusCode).toBe(201)
    expect(res.json<any>().type).toBe('doc')

    // Verify it's accessible via docs endpoint
    const docRes = await app.inject({
      method: 'GET',
      url: `/api/projects/${PROJECT_ID}/tickets/TST-001/docs/notes.md`,
    })
    expect(docRes.statusCode).toBe(200)
    expect(docRes.body).toContain('# My Notes')
  })
})
