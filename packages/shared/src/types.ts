export type TicketStatus = 'todo' | 'in_progress' | 'in_review' | 'done'

export type TicketPriority = 'low' | 'medium' | 'high'

// "human" = project owner, "agent:<name>" = AI agent (e.g. "agent:claude"), null = unassigned
export type Assignee = 'human' | `agent:${string}` | null

export interface Project {
  id: string
  name: string
  prefix: string        // e.g. "APP" — uppercase, 2–5 chars
  nextId: number        // auto-incrementing counter for ticket IDs
  createdAt: string     // ISO 8601
}

export interface RegistryEntry {
  id: string
  name: string
  prefix: string
  path: string          // absolute path to workspace root
}

export interface Registry {
  projects: RegistryEntry[]
}

export interface Ticket {
  id: string            // e.g. "APP-001"
  title: string
  status: TicketStatus
  priority: TicketPriority
  labels: string[]
  assignee: Assignee
  progress: number      // 0–100, manual only, never auto-calculated
  archived: boolean     // default false
  createdAt: string     // ISO 8601
  updatedAt: string     // ISO 8601
}

// Ticket as stored on disk — same as Ticket
export type TicketFile = Ticket

// Ticket with its docs as a filename → content map
export interface TicketWithDocs extends Ticket {
  docs: Record<string, string> // e.g. { "description.md": "# Hello\n..." }
}
