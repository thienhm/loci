// Shared types for the web package
// These mirror the types in @loci/shared but are kept local to avoid
// cross-package import complexity in the Vite build

export type TicketStatus = 'todo' | 'in_progress' | 'done'
export type TicketPriority = 'low' | 'medium' | 'high'

export interface Project {
  id: string
  name: string
  prefix: string
  nextId: number
  createdAt: string
  path?: string
}

export interface Ticket {
  id: string
  title: string
  status: TicketStatus
  priority: TicketPriority
  labels: string[]
  assignee: string | null
  progress: number
  createdAt: string
  updatedAt: string
}

export interface TicketCreateInput {
  title: string
  priority?: TicketPriority
  labels?: string[]
  assignee?: string | null
}

export interface TicketUpdateInput {
  title?: string
  status?: TicketStatus
  priority?: TicketPriority
  labels?: string[]
  assignee?: string | null
  progress?: number
}

// Ticket counts per status — used in dashboard project cards
export interface TicketCounts {
  todo: number
  in_progress: number
  done: number
}
