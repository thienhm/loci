import type { FastifyInstance } from 'fastify'
import { watch, existsSync } from 'node:fs'
import { join } from 'node:path'
import { findRegistryEntry } from './data'

export async function registerSseRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { projectId: string } }>(
    '/api/projects/:projectId/events',
    async (req, reply) => {
      const entry = findRegistryEntry(req.params.projectId)
      if (!entry) {
        return reply.status(404).send({ error: 'Project not found' })
      }

      const ticketsDir = join(entry.path, '.loci', 'tickets')

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })

      // Send initial connected event so client knows stream is alive
      reply.raw.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)

      if (existsSync(ticketsDir)) {
        const watcher = watch(ticketsDir, { recursive: true }, () => {
          reply.raw.write(`data: ${JSON.stringify({ type: 'change' })}\n\n`)
        })

        // Clean up watcher when client disconnects
        req.raw.on('close', () => {
          watcher.close()
        })
      }

      // Hand response control to the raw stream — Fastify won't touch it
      reply.hijack()
    }
  )
}
