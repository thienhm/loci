import type { FastifyInstance } from 'fastify'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { Ticket } from '@loci/shared'
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
  getFilesDir,
  listFiles,
  resolveUniqueFilename,
  guessMimeType,
} from './data'

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  // -------------------------------------------------------------------------
  // Projects
  // -------------------------------------------------------------------------

  // GET /api/projects — all projects from registry
  app.get('/api/projects', async (_req, reply) => {
    const registry = readRegistry()
    const projects = registry.projects.map((entry) => {
      try {
        return readProject(entry.path)
      } catch {
        return null
      }
    }).filter(Boolean)
    return reply.send(projects)
  })

  // GET /api/projects/:projectId — single project metadata
  app.get<{ Params: { projectId: string } }>('/api/projects/:projectId', async (req, reply) => {
    const entry = findRegistryEntry(req.params.projectId)
    if (!entry) return reply.status(404).send({ error: 'Project not found' })

    try {
      const project = readProject(entry.path)
      return reply.send(project)
    } catch {
      return reply.status(500).send({ error: 'Failed to read project' })
    }
  })

  // -------------------------------------------------------------------------
  // Tickets (nested under project)
  // -------------------------------------------------------------------------

  // GET /api/projects/:projectId/tickets — all tickets, optional ?status= ?assignee= ?archived=
  app.get<{
    Params: { projectId: string }
    Querystring: { status?: string; assignee?: string; archived?: string }
  }>('/api/projects/:projectId/tickets', async (req, reply) => {
    const entry = findRegistryEntry(req.params.projectId)
    if (!entry) return reply.status(404).send({ error: 'Project not found' })

    let tickets = listTickets(entry.path)

    if (req.query.status) {
      tickets = tickets.filter((t) => t.status === req.query.status)
    }
    if (req.query.assignee) {
      tickets = tickets.filter((t) => t.assignee === req.query.assignee)
    }
    // Handle archived filter: default excludes archived, ?archived=true shows only archived, ?archived=all shows all
    if (req.query.archived === 'true') {
      tickets = tickets.filter((t) => t.archived === true)
    } else if (req.query.archived !== 'all') {
      // Default: exclude archived
      tickets = tickets.filter((t) => t.archived !== true)
    }

    return reply.send(tickets)
  })

  // POST /api/projects/:projectId/tickets — create ticket
  app.post<{
    Params: { projectId: string }
    Body: { title: string; priority?: string; labels?: string[]; assignee?: string | null }
  }>('/api/projects/:projectId/tickets', async (req, reply) => {
    const entry = findRegistryEntry(req.params.projectId)
    if (!entry) return reply.status(404).send({ error: 'Project not found' })

    const project = readProject(entry.path)
    const { formatId } = await import('@loci/shared')
    const id = formatId(project.prefix, project.nextId)
    project.nextId++

    // Persist incremented nextId
    const { writeFileSync } = await import('fs')
    const { join } = await import('path')
    writeFileSync(
      join(entry.path, '.loci', 'project.json'),
      JSON.stringify(project, null, 2)
    )

    const now = new Date().toISOString()
    const ticket: Ticket = {
      id,
      title: req.body.title,
      status: 'todo',
      priority: (req.body.priority as Ticket['priority']) ?? 'medium',
      labels: req.body.labels ?? [],
      assignee: (req.body.assignee as Ticket['assignee']) ?? null,
      progress: 0,
      archived: false,
      createdAt: now,
      updatedAt: now,
    }

    createTicket(entry.path, ticket)
    return reply.status(201).send(ticket)
  })

  // GET /api/projects/:projectId/tickets/:ticketId — single ticket + docs
  app.get<{ Params: { projectId: string; ticketId: string } }>(
    '/api/projects/:projectId/tickets/:ticketId',
    async (req, reply) => {
      const entry = findRegistryEntry(req.params.projectId)
      if (!entry) return reply.status(404).send({ error: 'Project not found' })

      const ticket = readTicketWithDocs(entry.path, req.params.ticketId)
      if (!ticket) return reply.status(404).send({ error: 'Ticket not found' })

      return reply.send(ticket)
    }
  )

  // PATCH /api/projects/:projectId/tickets/:ticketId — update ticket fields
  app.patch<{
    Params: { projectId: string; ticketId: string }
    Body: Partial<Omit<Ticket, 'id' | 'createdAt'>>
  }>('/api/projects/:projectId/tickets/:ticketId', async (req, reply) => {
    const entry = findRegistryEntry(req.params.projectId)
    if (!entry) return reply.status(404).send({ error: 'Project not found' })

    const existing = readTicketWithDocs(entry.path, req.params.ticketId)
    if (!existing) return reply.status(404).send({ error: 'Ticket not found' })

    const { docs: _docs, ...ticketOnly } = existing
    const updated: Ticket = {
      ...ticketOnly,
      ...req.body,
      id: existing.id,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    }

    writeTicket(entry.path, updated)
    return reply.send(updated)
  })

  // -------------------------------------------------------------------------
  // Docs
  // -------------------------------------------------------------------------

  // GET /api/projects/:projectId/tickets/:ticketId/docs/:filename
  app.get<{ Params: { projectId: string; ticketId: string; filename: string } }>(
    '/api/projects/:projectId/tickets/:ticketId/docs/:filename',
    async (req, reply) => {
      const entry = findRegistryEntry(req.params.projectId)
      if (!entry) return reply.status(404).send({ error: 'Project not found' })

      const content = readTicketDoc(entry.path, req.params.ticketId, req.params.filename)
      if (content === null) return reply.status(404).send({ error: 'Document not found' })

      return reply.type('text/plain').send(content)
    }
  )

  // PUT /api/projects/:projectId/tickets/:ticketId/docs/:filename
  app.put<{
    Params: { projectId: string; ticketId: string; filename: string }
    Body: string
  }>('/api/projects/:projectId/tickets/:ticketId/docs/:filename', async (req, reply) => {
    const entry = findRegistryEntry(req.params.projectId)
    if (!entry) return reply.status(404).send({ error: 'Project not found' })

    // Validate filename is a .md file
    if (!req.params.filename.endsWith('.md')) {
      return reply.status(400).send({ error: 'Only .md files are allowed' })
    }

    writeTicketDoc(entry.path, req.params.ticketId, req.params.filename, req.body)
    return reply.status(204).send()
  })

  // -------------------------------------------------------------------------
  // Attachments
  // -------------------------------------------------------------------------

  // GET /api/projects/:projectId/tickets/:ticketId/attachments
  app.get<{ Params: { projectId: string; ticketId: string } }>(
    '/api/projects/:projectId/tickets/:ticketId/attachments',
    async (req, reply) => {
      const entry = findRegistryEntry(req.params.projectId)
      if (!entry) return reply.status(404).send({ error: 'Project not found' })

      const attachments = readAttachments(entry.path, req.params.ticketId)
      return reply.send(attachments)
    }
  )

  // PUT /api/projects/:projectId/tickets/:ticketId/attachments
  app.put<{
    Params: { projectId: string; ticketId: string }
    Body: string[]
  }>('/api/projects/:projectId/tickets/:ticketId/attachments', async (req, reply) => {
    const entry = findRegistryEntry(req.params.projectId)
    if (!entry) return reply.status(404).send({ error: 'Project not found' })

    if (!Array.isArray(req.body)) {
      return reply.status(400).send({ error: 'Body must be an array of strings' })
    }

    writeAttachments(entry.path, req.params.ticketId, req.body)
    return reply.status(204).send()
  })

  // -------------------------------------------------------------------------
  // Files (upload / download / delete)
  // -------------------------------------------------------------------------

  // GET /api/projects/:projectId/tickets/:ticketId/files — list files
  app.get<{ Params: { projectId: string; ticketId: string } }>(
    '/api/projects/:projectId/tickets/:ticketId/files',
    async (req, reply) => {
      const entry = findRegistryEntry(req.params.projectId)
      if (!entry) return reply.status(404).send({ error: 'Project not found' })

      const files = listFiles(entry.path, req.params.ticketId)
      return reply.send(files)
    }
  )

  // POST /api/projects/:projectId/tickets/:ticketId/files — upload file
  app.post<{ Params: { projectId: string; ticketId: string } }>(
    '/api/projects/:projectId/tickets/:ticketId/files',
    async (req, reply) => {
      const entry = findRegistryEntry(req.params.projectId)
      if (!entry) return reply.status(404).send({ error: 'Project not found' })

      const file = await req.file()
      if (!file) return reply.status(400).send({ error: 'No file uploaded' })

      const buffer = await file.toBuffer()
      const filename = file.filename

      // .md files are saved as ticket docs
      if (filename.endsWith('.md')) {
        writeTicketDoc(entry.path, req.params.ticketId, filename, buffer.toString('utf8'))
        return reply.status(201).send({ name: filename, type: 'doc' })
      }

      // All other files go to files/ directory
      const filesDir = getFilesDir(entry.path, req.params.ticketId)
      mkdirSync(filesDir, { recursive: true })

      const uniqueName = resolveUniqueFilename(filesDir, filename)
      writeFileSync(join(filesDir, uniqueName), buffer)

      return reply.status(201).send({ name: uniqueName, type: 'file' })
    }
  )

  // GET /api/projects/:projectId/tickets/:ticketId/files/:filename — serve file
  app.get<{ Params: { projectId: string; ticketId: string; filename: string } }>(
    '/api/projects/:projectId/tickets/:ticketId/files/:filename',
    async (req, reply) => {
      const entry = findRegistryEntry(req.params.projectId)
      if (!entry) return reply.status(404).send({ error: 'Project not found' })

      const filePath = join(getFilesDir(entry.path, req.params.ticketId), req.params.filename)
      if (!existsSync(filePath)) return reply.status(404).send({ error: 'File not found' })

      const content = readFileSync(filePath)
      const mimeType = guessMimeType(req.params.filename)
      return reply.type(mimeType).send(content)
    }
  )

  // DELETE /api/projects/:projectId/tickets/:ticketId/files/:filename — delete file
  app.delete<{ Params: { projectId: string; ticketId: string; filename: string } }>(
    '/api/projects/:projectId/tickets/:ticketId/files/:filename',
    async (req, reply) => {
      const entry = findRegistryEntry(req.params.projectId)
      if (!entry) return reply.status(404).send({ error: 'Project not found' })

      const filePath = join(getFilesDir(entry.path, req.params.ticketId), req.params.filename)
      if (!existsSync(filePath)) return reply.status(404).send({ error: 'File not found' })

      unlinkSync(filePath)
      return reply.status(204).send()
    }
  )
}
