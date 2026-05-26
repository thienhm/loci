export type TicketStatus = 'todo' | 'idea' | 'shaped' | 'ready' | 'in_progress' | 'in_review' | 'done'

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

export type ProjectHealthStatus = 'healthy' | 'warning' | 'error' | 'missing'

export interface TicketStatusCounts {
  idea: number
  shaped: number
  ready: number
  in_progress: number
  in_review: number
  done: number
  todo?: number
}

export interface DashboardProject {
  id: string
  name: string
  prefix: string
  path: string
  lociVersion: string
  lastSeenAt: string
  lastIndexedAt: string | null
  healthStatus: ProjectHealthStatus
  available: boolean
  unavailableReason?: string
  openTicketCount: number
  reviewTicketCount: number
  validationFailureCount: number
  ticketStatusCounts: TicketStatusCounts
}

export interface DashboardTicket {
  id: string
  title: string
  status: TicketStatus
  priority: TicketPriority
  labels: string[]
  assignee: Assignee
  progress: number
  riskLane: string
  readinessState: string
  validationState: string
  reviewState: string
  createdAt: string
  updatedAt: string
  storyPath: string | null
  designPath: string | null
  planPath: string | null
  validationPath: string | null
  evidencePath: string | null
  summaryPath: string | null
  lessonsPath: string | null
  harnessDeltaPath: string | null
  traceCount: number
  archived: boolean
}

export interface DashboardTicketWithDocs extends DashboardTicket {
  docs: Record<string, string>
}
