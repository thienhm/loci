// Shared types for the web package
// These mirror the types in @loci/shared but are kept local to avoid
// cross-package import complexity in the Vite build

export type TicketStatus = 'todo' | 'idea' | 'shaped' | 'ready' | 'in_progress' | 'in_review' | 'done'
export type TicketPriority = 'low' | 'medium' | 'high'
export type ProjectHealthStatus = 'healthy' | 'warning' | 'error' | 'missing'

export interface Project {
  id: string
  name: string
  prefix: string
  nextId?: number
  createdAt?: string
  path?: string
  lociVersion?: string
  lastSeenAt?: string
  lastIndexedAt?: string | null
  healthStatus?: ProjectHealthStatus
  available?: boolean
  unavailableReason?: string
  openTicketCount?: number
  reviewTicketCount?: number
  validationFailureCount?: number
  ticketStatusCounts?: TicketCounts
}

export interface Ticket {
  id: string
  title: string
  status: TicketStatus
  priority: TicketPriority
  labels: string[]
  assignee: string | null
  progress: number
  archived: boolean
  createdAt: string
  updatedAt: string
  riskLane?: string
  readinessState?: string
  validationState?: string
  reviewState?: string
  storyPath?: string | null
  designPath?: string | null
  planPath?: string | null
  validationPath?: string | null
  evidencePath?: string | null
  summaryPath?: string | null
  lessonsPath?: string | null
  harnessDeltaPath?: string | null
  traceCount?: number
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
  archived?: boolean
}

// Ticket counts per status — used in dashboard project cards
export interface TicketCounts {
  todo?: number
  idea: number
  shaped: number
  ready: number
  in_progress: number
  in_review: number
  done: number
}

// Ticket with docs map — returned by GET /api/projects/:id/tickets/:ticketId
export interface TicketWithDocs extends Ticket {
  docs: Record<string, string> // filename → content
}
