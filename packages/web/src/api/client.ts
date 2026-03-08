import type { Project, Ticket, TicketWithDocs, TicketCreateInput, TicketUpdateInput } from '../types'

const BASE = '/api'

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`)
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`)
  return res.json()
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`POST ${path} failed: ${res.status}`)
  return res.json()
}

async function patch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${path} failed: ${res.status}`)
  return res.json()
}

// Projects
export async function fetchProjects(): Promise<Project[]> {
  return get<Project[]>('/projects')
}

export async function fetchProject(projectId: string): Promise<Project> {
  return get<Project>(`/projects/${projectId}`)
}

// Tickets
export async function fetchTickets(
  projectId: string,
  filters?: { status?: string; assignee?: string }
): Promise<Ticket[]> {
  const params = new URLSearchParams()
  if (filters?.status) params.set('status', filters.status)
  if (filters?.assignee) params.set('assignee', filters.assignee)
  const query = params.toString() ? `?${params}` : ''
  return get<Ticket[]>(`/projects/${projectId}/tickets${query}`)
}

export async function createTicket(
  projectId: string,
  input: TicketCreateInput
): Promise<Ticket> {
  return post<Ticket>(`/projects/${projectId}/tickets`, input)
}

export async function updateTicket(
  projectId: string,
  ticketId: string,
  input: TicketUpdateInput
): Promise<Ticket> {
  return patch<Ticket>(`/projects/${projectId}/tickets/${ticketId}`, input)
}

// Single ticket with docs map
export async function fetchTicket(
  projectId: string,
  ticketId: string
): Promise<TicketWithDocs> {
  return get<TicketWithDocs>(`/projects/${projectId}/tickets/${ticketId}`)
}

// Read a markdown doc's raw content
export async function fetchDoc(
  projectId: string,
  ticketId: string,
  filename: string
): Promise<string> {
  const res = await fetch(`/api/projects/${projectId}/tickets/${ticketId}/docs/${filename}`)
  if (!res.ok) throw new Error(`GET doc ${filename} failed: ${res.status}`)
  return res.text()
}

// Write a markdown doc
export async function writeDoc(
  projectId: string,
  ticketId: string,
  filename: string,
  content: string
): Promise<void> {
  const res = await fetch(`/api/projects/${projectId}/tickets/${ticketId}/docs/${filename}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'text/plain' },
    body: content,
  })
  if (!res.ok) throw new Error(`PUT doc ${filename} failed: ${res.status}`)
}

// Fetch attachments list
export async function fetchAttachments(
  projectId: string,
  ticketId: string
): Promise<string[]> {
  return get<string[]>(`/projects/${projectId}/tickets/${ticketId}/attachments`)
}

// Write attachments list
export async function writeAttachments(
  projectId: string,
  ticketId: string,
  paths: string[]
): Promise<string[]> {
  const res = await fetch(`/api/projects/${projectId}/tickets/${ticketId}/attachments`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(paths),
  })
  if (!res.ok) throw new Error(`PUT attachments failed: ${res.status}`)
  return res.json()
}
