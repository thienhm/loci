import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import Fastify, { type FastifyInstance } from 'fastify'
import cors from '@fastify/cors'
import { registerRoutes } from '../routes'
import { registerSseRoutes } from '../sse'

let tmpHome: string
let tmpWorkspace: string
let app: FastifyInstance

const PROJECT_ID = 'sse-project-uuid'
const PROJECT_PREFIX = 'SSE'

async function buildApp() {
  const instance = Fastify({ logger: false })
  await instance.register(cors, { origin: true })
  instance.addContentTypeParser('text/plain', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body)
  })
  await registerRoutes(instance)
  await registerSseRoutes(instance)
  instance.setNotFoundHandler((_req, reply) => reply.status(404).send({ error: 'Not found' }))
  await instance.ready()
  return instance
}

beforeEach(async () => {
  tmpHome = mkdtempSync(join(tmpdir(), 'loci-sse-home-'))
  tmpWorkspace = mkdtempSync(join(tmpdir(), 'loci-sse-ws-'))
  process.env.HOME = tmpHome

  // Seed registry
  mkdirSync(join(tmpHome, '.loci'), { recursive: true })
  writeFileSync(
    join(tmpHome, '.loci', 'registry.json'),
    JSON.stringify({
      projects: [{ id: PROJECT_ID, name: 'SSE Test', prefix: PROJECT_PREFIX, path: tmpWorkspace }],
    }, null, 2)
  )

  // Seed project
  mkdirSync(join(tmpWorkspace, '.loci', 'tickets'), { recursive: true })
  writeFileSync(
    join(tmpWorkspace, '.loci', 'project.json'),
    JSON.stringify({ id: PROJECT_ID, name: 'SSE Test', prefix: PROJECT_PREFIX, nextId: 1, createdAt: '2026-01-01T00:00:00.000Z' }, null, 2)
  )

  app = await buildApp()
})

afterEach(async () => {
  await app.close()
  rmSync(tmpHome, { recursive: true, force: true })
  rmSync(tmpWorkspace, { recursive: true, force: true })
})

// ---------------------------------------------------------------------------
// GET /api/projects/:projectId/events
//
// SSE streams stay open indefinitely, so inject() hangs. For the streaming
// tests we start a real listener on a random port and make a real fetch()
// that we abort after reading the first chunk. The 404 case closes immediately,
// so inject() works fine there.
// ---------------------------------------------------------------------------

describe('GET /api/projects/:projectId/events', () => {
  it('returns 200 with SSE headers and connected heartbeat for a known project', async () => {
    // Start a real HTTP listener on a random port
    await app.listen({ port: 0, host: '127.0.0.1' })
    const address = app.server.address()
    if (!address || typeof address === 'string') throw new Error('No address')
    const port = address.port

    const ac = new AbortController()
    const res = await fetch(
      `http://127.0.0.1:${port}/api/projects/${PROJECT_ID}/events`,
      { signal: ac.signal }
    )

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('text/event-stream')
    expect(res.headers.get('cache-control')).toBe('no-cache')

    // Read first chunk — should contain the connected heartbeat
    const reader = res.body!.getReader()
    const { value } = await reader.read()
    const text = new TextDecoder().decode(value)
    expect(text).toContain('data: {"type":"connected"}')

    // Abort stream — triggers cleanup of the fs.watch watcher on server side
    ac.abort()
  })

  it('returns 404 for unknown project', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/projects/nonexistent-uuid/events',
    })
    expect(res.statusCode).toBe(404)
    expect(res.json<any>().error).toBe('Project not found')
  })
})
