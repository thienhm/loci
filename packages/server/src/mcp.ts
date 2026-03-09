import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { z } from 'zod'
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
} from './data'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Given a ticket ID like "LCI-001", find the project whose prefix is "LCI".
 */
function findProjectByTicketId(ticketId: string) {
  const prefix = ticketId.split('-')[0]
  const registry = readRegistry()
  const entry = registry.projects.find((p) => {
    try {
      const project = readProject(p.path)
      return project.prefix === prefix
    } catch {
      return false
    }
  })
  return entry ?? null
}

function errorResult(message: string) {
  return { content: [{ type: 'text' as const, text: message }], isError: true }
}

function jsonResult(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

export function createMcpServer(): McpServer {
  const server = new McpServer({ name: 'loci', version: '0.1.0' })

  // -------------------------------------------------------------------------
  // Resources
  // -------------------------------------------------------------------------

  server.registerResource(
    'loci-instructions',
    'loci://instructions',
    {
      title: 'Loci Instructions',
      description: 'Project instructions from LOCI.md',
      mimeType: 'text/markdown',
    },
    async () => {
      // Walk up from cwd to find LOCI.md
      const registry = readRegistry()
      if (registry.projects.length > 0) {
        const lociMdPath = join(registry.projects[0].path, 'LOCI.md')
        if (existsSync(lociMdPath)) {
          return {
            contents: [{ uri: 'loci://instructions', text: readFileSync(lociMdPath, 'utf8') }],
          }
        }
      }
      return {
        contents: [{ uri: 'loci://instructions', text: '# Loci\n\nNo LOCI.md found.' }],
      }
    }
  )

  // -------------------------------------------------------------------------
  // Tools
  // -------------------------------------------------------------------------

  server.registerTool(
    'list_projects',
    {
      description: 'List all registered Loci projects',
      inputSchema: z.object({}),
    },
    async () => {
      const registry = readRegistry()
      const projects = registry.projects.map((entry) => {
        try {
          return readProject(entry.path)
        } catch {
          return null
        }
      }).filter(Boolean)
      return jsonResult(projects)
    }
  )

  server.registerTool(
    'list_tickets',
    {
      description: 'List tickets, optionally filtered by project, status, or assignee',
      inputSchema: z.object({
        project_id: z.string().optional().describe('Project UUID (omit for all projects)'),
        status: z.enum(['todo', 'in_progress', 'in_review', 'done']).optional(),
        assignee: z.string().optional(),
      }),
    },
    async ({ project_id, status, assignee }) => {
      const registry = readRegistry()
      const entries = project_id
        ? registry.projects.filter((p) => p.id === project_id)
        : registry.projects

      let tickets: Ticket[] = []
      for (const entry of entries) {
        tickets = tickets.concat(listTickets(entry.path))
      }

      if (status) tickets = tickets.filter((t) => t.status === status)
      if (assignee) tickets = tickets.filter((t) => t.assignee === assignee)

      return jsonResult(tickets)
    }
  )

  server.registerTool(
    'get_ticket',
    {
      description: 'Get a ticket with all its document contents',
      inputSchema: z.object({
        id: z.string().describe('Ticket ID, e.g. LCI-001'),
      }),
    },
    async ({ id }) => {
      const entry = findProjectByTicketId(id)
      if (!entry) return errorResult(`Project not found for ticket ${id}`)

      const ticket = readTicketWithDocs(entry.path, id)
      if (!ticket) return errorResult(`Ticket ${id} not found`)

      return jsonResult(ticket)
    }
  )

  server.registerTool(
    'create_ticket',
    {
      description: 'Create a new ticket in a project',
      inputSchema: z.object({
        title: z.string(),
        project_id: z.string().optional().describe('Project UUID (omit to use first registered project)'),
        priority: z.enum(['low', 'medium', 'high']).optional(),
        labels: z.array(z.string()).optional(),
        assignee: z.string().nullable().optional(),
      }),
    },
    async ({ title, project_id, priority, labels, assignee }) => {
      const registry = readRegistry()
      if (registry.projects.length === 0) {
        return errorResult('No projects registered. Run `loci init` first.')
      }

      const entry = project_id
        ? registry.projects.find((p) => p.id === project_id) ?? null
        : registry.projects[0]

      if (!entry) {
        return errorResult(`Project not found: ${project_id}`)
      }
      const project = readProject(entry.path)
      const { formatId } = await import('@loci/shared')
      const id = formatId(project.prefix, project.nextId)
      project.nextId++

      const { writeFileSync } = await import('fs')
      const { join } = await import('path')
      writeFileSync(
        join(entry.path, '.loci', 'project.json'),
        JSON.stringify(project, null, 2)
      )

      const now = new Date().toISOString()
      const ticket: Ticket = {
        id,
        title,
        status: 'todo',
        priority: priority ?? 'medium',
        labels: labels ?? [],
        assignee: assignee ?? null,
        progress: 0,
        createdAt: now,
        updatedAt: now,
      }

      createTicket(entry.path, ticket)
      return jsonResult(ticket)
    }
  )

  server.registerTool(
    'update_ticket',
    {
      description: 'Update fields on an existing ticket',
      inputSchema: z.object({
        id: z.string().describe('Ticket ID, e.g. LCI-001'),
        fields: z.object({
          title: z.string().optional(),
          status: z.enum(['todo', 'in_progress', 'in_review', 'done']).optional(),
          priority: z.enum(['low', 'medium', 'high']).optional(),
          labels: z.array(z.string()).optional(),
          assignee: z.string().nullable().optional(),
          progress: z.number().min(0).max(100).optional(),
        }),
      }),
    },
    async ({ id, fields }) => {
      const entry = findProjectByTicketId(id)
      if (!entry) return errorResult(`Project not found for ticket ${id}`)

      const existing = readTicketWithDocs(entry.path, id)
      if (!existing) return errorResult(`Ticket ${id} not found`)

      const { docs: _docs, ...ticketOnly } = existing
      const updated: Ticket = {
        ...ticketOnly,
        ...fields,
        id: existing.id,
        createdAt: existing.createdAt,
        updatedAt: new Date().toISOString(),
      }

      writeTicket(entry.path, updated)
      return jsonResult(updated)
    }
  )

  server.registerTool(
    'read_ticket_doc',
    {
      description: 'Read a markdown document attached to a ticket',
      inputSchema: z.object({
        id: z.string().describe('Ticket ID, e.g. LCI-001'),
        filename: z.string().describe('Document filename, e.g. description.md'),
      }),
    },
    async ({ id, filename }) => {
      const entry = findProjectByTicketId(id)
      if (!entry) return errorResult(`Project not found for ticket ${id}`)

      const content = readTicketDoc(entry.path, id, filename)
      if (content === null) return errorResult(`Document ${filename} not found on ticket ${id}`)

      return { content: [{ type: 'text' as const, text: content }] }
    }
  )

  server.registerTool(
    'write_ticket_doc',
    {
      description: 'Write or update a markdown document on a ticket',
      inputSchema: z.object({
        id: z.string().describe('Ticket ID, e.g. LCI-001'),
        filename: z.string().describe('Document filename, must end in .md'),
        content: z.string().describe('Markdown content to write'),
      }),
    },
    async ({ id, filename, content }) => {
      if (!filename.endsWith('.md')) {
        return errorResult('Only .md files are allowed')
      }

      const entry = findProjectByTicketId(id)
      if (!entry) return errorResult(`Project not found for ticket ${id}`)

      // Ensure ticket exists
      const ticket = readTicketWithDocs(entry.path, id)
      if (!ticket) return errorResult(`Ticket ${id} not found`)

      writeTicketDoc(entry.path, id, filename, content)
      return { content: [{ type: 'text' as const, text: `Written ${filename} to ticket ${id}` }] }
    }
  )

  return server
}
