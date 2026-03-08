import type { Project, Ticket, TicketCreateInput, TicketUpdateInput } from '../types'

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
