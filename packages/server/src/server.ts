import Fastify from 'fastify'
import cors from '@fastify/cors'
import multipart from '@fastify/multipart'
import staticPlugin from '@fastify/static'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { registerRoutes } from './routes'
import { registerSseRoutes } from './sse'
import { createMcpServer } from './mcp'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const publicDir = join(__dirname, '..', 'public')

export async function createServer(port: number): Promise<void> {
  const app = Fastify({ logger: false })

  await app.register(cors, {
    origin: true, // allow all origins in dev
  })

  await app.register(multipart)

  // Content-type parser for plain text (used by PUT doc routes)
  app.addContentTypeParser('text/plain', { parseAs: 'string' }, (_req, body, done) => {
    done(null, body)
  })

  // Serve built web assets from public/ (production mode)
  if (existsSync(publicDir)) {
    await app.register(staticPlugin, {
      root: publicDir,
      prefix: '/',
    })
  }

  // Register all API routes
  await registerRoutes(app)
  await registerSseRoutes(app)

  // MCP endpoint — stateless, one transport per request
  app.post('/mcp', async (req, reply) => {
    const mcpServer = createMcpServer()
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
    await mcpServer.connect(transport)
    await transport.handleRequest(req.raw, reply.raw, req.body)
    reply.hijack()
  })

  app.get('/mcp', async (req, reply) => {
    reply.status(405).send({ error: 'MCP requires POST requests' })
  })

  // SPA catch-all — return index.html for any non-API, non-MCP route
  // so React Router can handle client-side navigation
  app.setNotFoundHandler((req, reply) => {
    const isApi = req.url.startsWith('/api')
    const isMcp = req.url.startsWith('/mcp')
    const indexPath = join(publicDir, 'index.html')

    if (!isApi && !isMcp && existsSync(indexPath)) {
      return reply.type('text/html').send(readFileSync(indexPath, 'utf-8'))
    }

    reply.status(404).send({ error: 'Not found' })
  })

  try {
    await app.listen({ port, host: '127.0.0.1' })
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'EADDRINUSE') {
      console.error(`✗ Port ${port} is already in use.`)
      try {
        const pid = execSync(`lsof -ti tcp:${port}`).toString().trim()
        if (pid) {
          console.error(`  Process using it: PID ${pid}`)
          console.error(`  To free the port, run:\n\n    kill ${pid}\n`)
        }
      } catch {
        console.error(`  Could not detect the process. Try:\n\n    lsof -i :${port}\n`)
      }
      process.exit(1)
    }
    throw err
  }

  console.log(`✓ Loci server running at http://localhost:${port}`)
  console.log(`  API: http://localhost:${port}/api/projects`)
  console.log(`  MCP: http://localhost:${port}/mcp`)
  if (existsSync(publicDir)) {
    console.log(`  Web: http://localhost:${port}`)
  }
}
