import type { FastifyInstance } from 'fastify'
import { watch, mkdirSync } from 'node:fs'
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

      // Ensure the directory exists so the watcher can always attach
      mkdirSync(ticketsDir, { recursive: true })

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      })

      // Send initial connected event so client knows stream is alive
      reply.raw.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`)

      // Debounce watcher events — fs.watch fires 2-4 times per write
      let debounceTimer: ReturnType<typeof setTimeout> | null = null

      const watcher = watch(ticketsDir, { recursive: true }, () => {
        if (debounceTimer !== null) clearTimeout(debounceTimer)
        debounceTimer = setTimeout(() => {
          debounceTimer = null
          reply.raw.write(`data: ${JSON.stringify({ type: 'change' })}\n\n`)
        }, 150)
      })

      // Clean up watcher and any pending debounce when client disconnects
      req.raw.on('close', () => {
        if (debounceTimer !== null) clearTimeout(debounceTimer)
        watcher.close()
      })

      // Hand response control to the raw stream — Fastify won't touch it
      reply.hijack()
    }
  )
}
