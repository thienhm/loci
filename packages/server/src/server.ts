import Fastify from 'fastify'
import cors from '@fastify/cors'
import { registerRoutes } from './routes'

export async function createServer(port: number): Promise<void> {
  const app = Fastify({ logger: false })

  await app.register(cors, {
    origin: true, // allow all origins in dev
  })

  // Content-type parser for plain text (used by PUT doc routes)
  app.addContentTypeParser('text/plain', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body)
  })

  // Register all API routes
  await registerRoutes(app)

  // Root — placeholder until Phase 4 web UI exists
  app.get('/', async (_req, reply) => {
    return reply
      .type('text/html')
      .send('<h1>Loci</h1><p>Web UI coming in Phase 4. API is live at <a href="/api/projects">/api/projects</a>.</p>')
  })

  // 404 catch-all
  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send({ error: 'Not found' })
  })

  await app.listen({ port, host: '127.0.0.1' })
  console.log(`✓ Loci server running at http://localhost:${port}`)
  console.log(`  API: http://localhost:${port}/api/projects`)
}
