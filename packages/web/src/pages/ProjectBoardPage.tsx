import { useState, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  LayoutGrid,
  List,
  Plus,
  Loader2,
  AlertCircle,
  User,
  Bot,
  GripVertical,
} from 'lucide-react'
import { fetchProject, fetchTickets, updateTicket, createTicket } from '../api/client'
import { useSSE } from '../hooks/useSSE'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import type { Project, Ticket, TicketStatus, TicketPriority } from '../types'

type ViewMode = 'kanban' | 'list'
type SortField = 'id' | 'title' | 'status' | 'priority' | 'updatedAt'
type SortDir = 'asc' | 'desc'

const COLUMNS: { id: TicketStatus; label: string }[] = [
  { id: 'todo', label: 'Todo' },
  { id: 'in_progress', label: 'In Progress' },
  { id: 'in_review', label: 'In Review' },
  { id: 'done', label: 'Done' },
]

export function ProjectBoardPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const queryClient = useQueryClient()
  const [viewMode, setViewMode] = useState<ViewMode>('kanban')
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null)
  const [showNewTicket, setShowNewTicket] = useState(false)
  const [newTicketTitle, setNewTicketTitle] = useState('')
  const [sortField, setSortField] = useState<SortField>('updatedAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Auto-refresh board when server emits SSE change events
  useSSE(projectId)

  // Keyboard shortcuts: N = new ticket, K = kanban view, L = list view
  const shortcuts = useMemo(() => ({
    'n': () => { setNewTicketTitle(''); setShowNewTicket(true) },
    'N': () => { setNewTicketTitle(''); setShowNewTicket(true) },
    'k': () => setViewMode('kanban'),
    'K': () => setViewMode('kanban'),
    'l': () => setViewMode('list'),
    'L': () => setViewMode('list'),
  }), [])
  useKeyboardShortcuts(shortcuts)

  const { data: project, isLoading: projectLoading } = useQuery<Project>({
    queryKey: ['project', projectId],
    queryFn: () => fetchProject(projectId!),
    enabled: !!projectId,
  })

  const { data: tickets = [], isLoading: ticketsLoading, error } = useQuery<Ticket[]>({
    queryKey: ['tickets', projectId],
    queryFn: () => fetchTickets(projectId!),
    enabled: !!projectId,
  })

  const updateMutation = useMutation({
    mutationFn: ({ ticketId, status }: { ticketId: string; status: TicketStatus }) =>
      updateTicket(projectId!, ticketId, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tickets', projectId] }),
  })

  const createMutation = useMutation({
    mutationFn: (title: string) => createTicket(projectId!, { title }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets', projectId] })
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setNewTicketTitle('')
      setShowNewTicket(false)
    },
  })

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  function handleDragStart(event: DragStartEvent) {
    const ticket = tickets.find((t) => t.id === event.active.id)
    if (ticket) setActiveTicket(ticket)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTicket(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    // Determine target column from the over id
    const targetStatus = COLUMNS.find((c) => c.id === over.id)?.id
    if (targetStatus) {
      const ticket = tickets.find((t) => t.id === active.id)
      if (ticket && ticket.status !== targetStatus) {
        updateMutation.mutate({ ticketId: String(active.id), status: targetStatus })
      }
    }
  }

  function handleCreateTicket() {
    if (!newTicketTitle.trim()) return
    createMutation.mutate(newTicketTitle.trim())
  }

  if (projectLoading || ticketsLoading) {
    return (
      <div style={styles.center}>
        <Loader2 size={22} style={{ color: 'var(--color-primary)', animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  if (error || !project) {
    // Detect server offline vs. project not found
    const isOffline = error instanceof TypeError && error.message.includes('fetch')
    return (
      <div style={styles.center}>
        <AlertCircle size={32} style={{ color: 'var(--color-priority-high)', marginBottom: '12px' }} />
        <h2 style={{ fontSize: '16px', fontWeight: '700', color: 'var(--color-text)', margin: '0 0 6px' }}>
          {isOffline ? 'Cannot connect to Loci server' : 'Project not found'}
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', margin: '0 0 16px', textAlign: 'center' }}>
          {isOffline
            ? 'Make sure the server is running: loci serve'
            : `No project found with ID: ${projectId}`}
        </p>
        <Link
          to="/"
          style={{
            fontSize: '13px',
            color: 'var(--color-primary)',
            textDecoration: 'none',
            fontWeight: '600',
          }}
        >
          ← Back to dashboard
        </Link>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      {/* Page header */}
      <div style={styles.header}>
        <div>
          <h1 id="board-heading" style={styles.heading}>
            {project.name}
          </h1>
          <span style={styles.prefixBadge}>{project.prefix}</span>
        </div>

        <div style={styles.headerActions}>
          {/* New ticket button */}
          <button
            id="new-ticket-btn"
            onClick={() => setShowNewTicket(true)}
            style={styles.newTicketBtn}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-accent-hover, #EA6C08)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-accent)')}
          >
            <Plus size={14} />
            New Ticket
          </button>

          {/* View toggle */}
          <div style={styles.viewToggle}>
            <ToggleButton
              id="view-kanban-btn"
              active={viewMode === 'kanban'}
              onClick={() => setViewMode('kanban')}
              icon={<LayoutGrid size={14} />}
              label="Kanban"
            />
            <ToggleButton
              id="view-list-btn"
              active={viewMode === 'list'}
              onClick={() => setViewMode('list')}
              icon={<List size={14} />}
              label="List"
            />
          </div>
        </div>
      </div>

      {/* New ticket form */}
      {showNewTicket && (
        <div style={styles.newTicketForm}>
          <input
            id="new-ticket-input"
            autoFocus
            placeholder="Ticket title…"
            value={newTicketTitle}
            onChange={(e) => setNewTicketTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateTicket()
              if (e.key === 'Escape') setShowNewTicket(false)
            }}
            style={styles.newTicketInput}
          />
          <button
            id="new-ticket-save-btn"
            onClick={handleCreateTicket}
            disabled={!newTicketTitle.trim() || createMutation.isPending}
            style={styles.saveBtn}
          >
            {createMutation.isPending ? 'Creating…' : 'Create'}
          </button>
          <button
            id="new-ticket-cancel-btn"
            onClick={() => setShowNewTicket(false)}
            style={styles.cancelBtn}
          >
            Cancel
          </button>
        </div>
      )}

      {/* Board */}
      {viewMode === 'kanban' ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
        >
          <div style={styles.kanban}>
            {COLUMNS.map((col) => {
              const colTickets = tickets.filter((t) => t.status === col.id)
              return (
                <KanbanColumn
                  key={col.id}
                  column={col}
                  tickets={colTickets}
                  projectId={projectId!}
                />
              )
            })}
          </div>

          <DragOverlay>
            {activeTicket && (
              <TicketCard ticket={activeTicket} isDragging projectId={projectId!} />
            )}
          </DragOverlay>
        </DndContext>
      ) : (
        <TicketTable
          tickets={tickets}
          projectId={projectId!}
          sortField={sortField}
          sortDir={sortDir}
          onSort={(field) => {
            if (field === sortField) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
            else { setSortField(field); setSortDir('asc') }
          }}
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Kanban column
// ─────────────────────────────────────────────────────────────────────────────

function KanbanColumn({
  column,
  tickets,
  projectId,
}: {
  column: { id: TicketStatus; label: string }
  tickets: Ticket[]
  projectId: string
}) {
  const { setNodeRef, isOver } = useSortable({ id: column.id })

  return (
    <div
      ref={setNodeRef}
      id={`kanban-col-${column.id}`}
      style={{
        ...styles.column,
        background: isOver ? '#F0FDFA' : 'var(--color-background)',
        borderColor: isOver ? 'var(--color-primary)' : 'var(--color-border)',
        transition: 'border-color 150ms ease, background 150ms ease',
      }}
    >
      {/* Column header */}
      <div style={styles.columnHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ ...styles.statusDot, background: statusColors[column.id] }} />
          <span style={styles.columnTitle}>{column.label}</span>
        </div>
        <span style={styles.countBadge}>{tickets.length}</span>
      </div>

      {/* Tickets */}
      <SortableContext items={tickets.map(t => t.id)} strategy={verticalListSortingStrategy}>
        <div style={styles.columnBody}>
          {tickets.map((ticket) => (
            <SortableTicketCard key={ticket.id} ticket={ticket} projectId={projectId} />
          ))}

          {tickets.length === 0 && (
            <div style={styles.dropZone}>
              Drop here
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Sortable ticket card wrapper
// ─────────────────────────────────────────────────────────────────────────────

function SortableTicketCard({ ticket, projectId }: { ticket: Ticket; projectId: string }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <TicketCard ticket={ticket} projectId={projectId} dragHandleProps={listeners} />
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Ticket card
// ─────────────────────────────────────────────────────────────────────────────

function TicketCard({
  ticket,
  projectId,
  isDragging,
  dragHandleProps,
}: {
  ticket: Ticket
  projectId: string
  isDragging?: boolean
  dragHandleProps?: Record<string, unknown>
}) {
  return (
    <div
      id={`ticket-card-${ticket.id}`}
      {...dragHandleProps}
      style={{
        ...styles.ticketCard,
        boxShadow: isDragging
          ? '0 8px 24px rgba(13,148,136,0.18)'
          : '0 1px 3px rgba(0,0,0,0.06)',
        cursor: isDragging ? 'grabbing' : 'grab',
        transform: isDragging ? 'rotate(2deg)' : 'none',
      }}
    >
      {/* Drag handle icon + ID */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        <div style={styles.dragHandle}>
          <GripVertical size={12} color="var(--color-text-muted)" />
        </div>
        <Link
          to={`/project/${projectId}/${ticket.id}`}
          style={{ ...styles.ticketId, textDecoration: 'none' }}
          onClick={(e) => e.stopPropagation()}
        >
          {ticket.id}
        </Link>
      </div>

      {/* Title */}
      <p style={styles.ticketTitle}>{ticket.title}</p>

      {/* Footer: priority + assignee */}
      <div style={styles.ticketFooter}>
        <PriorityBadge priority={ticket.priority} />
        {ticket.assignee && <AssigneeBadge assignee={ticket.assignee} />}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Ticket table (list view)
// ─────────────────────────────────────────────────────────────────────────────

function TicketTable({
  tickets,
  projectId,
  sortField,
  sortDir,
  onSort,
}: {
  tickets: Ticket[]
  projectId: string
  sortField: SortField
  sortDir: SortDir
  onSort: (field: SortField) => void
}) {
  const sorted = [...tickets].sort((a, b) => {
    const mul = sortDir === 'asc' ? 1 : -1
    const av = a[sortField as keyof Ticket] ?? ''
    const bv = b[sortField as keyof Ticket] ?? ''
    return String(av) < String(bv) ? -mul : String(av) > String(bv) ? mul : 0
  })

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <span style={{ opacity: 0.3 }}> ↕</span>
    return <span style={{ color: 'var(--color-primary)' }}>{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>
  }

  return (
    <div id="ticket-table" style={styles.tableWrapper}>
      <table style={styles.table}>
        <thead>
          <tr>
            {([
              ['id', 'ID'],
              ['title', 'Title'],
              ['status', 'Status'],
              ['priority', 'Priority'],
              ['updatedAt', 'Updated'],
            ] as [SortField, string][]).map(([field, label]) => (
              <th
                key={field}
                onClick={() => onSort(field)}
                style={styles.th}
              >
                {label}
                <SortIcon field={field} />
              </th>
            ))}
            <th style={styles.th}>Assignee</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((ticket) => (
            <tr
              key={ticket.id}
              id={`ticket-row-${ticket.id}`}
              style={styles.tr}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#F8FFFE')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '')}
            >
              <td style={styles.td}>
                <Link
                  to={`/project/${projectId}/${ticket.id}`}
                  style={{ ...styles.ticketId, textDecoration: 'none' }}
                >
                  {ticket.id}
                </Link>
              </td>
              <td style={{ ...styles.td, maxWidth: '300px' }}>
                <span style={{ fontSize: '13px', color: 'var(--color-text)', fontWeight: '500' }}>
                  {ticket.title}
                </span>
              </td>
              <td style={styles.td}>
                <StatusBadge status={ticket.status} />
              </td>
              <td style={styles.td}>
                <PriorityBadge priority={ticket.priority} />
              </td>
              <td style={styles.td}>
                <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>
                  {new Date(ticket.updatedAt).toLocaleDateString()}
                </span>
              </td>
              <td style={styles.td}>
                {ticket.assignee ? <AssigneeBadge assignee={ticket.assignee} /> : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {sorted.length === 0 && (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '14px' }}>
          No tickets yet — create one with the button above.
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared badge components
// ─────────────────────────────────────────────────────────────────────────────

const statusColors: Record<TicketStatus, string> = {
  todo: '#94A3B8',
  in_progress: '#3B82F6',
  in_review: '#F59E0B',
  done: '#22C55E',
}
const statusLabels: Record<TicketStatus, string> = {
  todo: 'Todo',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
}

function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '5px',
        padding: '2px 8px',
        borderRadius: '20px',
        fontSize: '11px',
        fontWeight: '600',
        background: `${statusColors[status]}1A`,
        color: statusColors[status],
      }}
    >
      <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: statusColors[status] }} />
      {statusLabels[status]}
    </span>
  )
}

const priorityColors: Record<TicketPriority, string> = {
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#94A3B8',
}

function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '1px 7px',
        borderRadius: '4px',
        fontSize: '11px',
        fontWeight: '600',
        background: `${priorityColors[priority]}18`,
        color: priorityColors[priority],
      }}
    >
      {priority.charAt(0).toUpperCase() + priority.slice(1)}
    </span>
  )
}

function AssigneeBadge({ assignee }: { assignee: string }) {
  const isAgent = assignee.startsWith('agent:')
  const label = isAgent ? assignee.replace('agent:', '') : 'you'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '4px',
        fontSize: '11px',
        color: 'var(--color-text-muted)',
      }}
    >
      {isAgent ? <Bot size={11} /> : <User size={11} />}
      {label}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// View toggle button
// ─────────────────────────────────────────────────────────────────────────────

function ToggleButton({
  id,
  active,
  onClick,
  icon,
  label,
}: {
  id: string
  active: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
}) {
  return (
    <button
      id={id}
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        padding: '5px 10px',
        fontSize: '12px',
        fontWeight: active ? '600' : '400',
        color: active ? 'var(--color-primary)' : 'var(--color-text-muted)',
        background: active ? '#CCFBF1' : 'transparent',
        border: 'none',
        borderRadius: '5px',
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'all 150ms ease',
      }}
    >
      {icon}
      {label}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = {
  page: {
    padding: '28px 32px',
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
  },
  heading: {
    fontSize: '20px',
    fontWeight: '700',
    color: 'var(--color-text)',
    margin: 0,
  },
  prefixBadge: {
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '0.05em',
    padding: '1px 6px',
    borderRadius: '4px',
    background: '#CCFBF1',
    color: 'var(--color-primary)',
    display: 'inline-block',
    marginTop: '4px',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  newTicketBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '7px 14px',
    borderRadius: '6px',
    border: 'none',
    background: 'var(--color-accent)',
    color: '#fff',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'background 150ms ease',
  },
  viewToggle: {
    display: 'flex',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '6px',
    padding: '2px',
    gap: '2px',
  },
  newTicketForm: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    padding: '12px 16px',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-primary)',
    borderRadius: '8px',
    flexShrink: 0,
  },
  newTicketInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    fontSize: '14px',
    color: 'var(--color-text)',
    background: 'transparent',
    fontFamily: 'inherit',
  },
  saveBtn: {
    padding: '5px 12px',
    borderRadius: '5px',
    border: 'none',
    background: 'var(--color-primary)',
    color: '#fff',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  cancelBtn: {
    padding: '5px 12px',
    borderRadius: '5px',
    border: '1px solid var(--color-border)',
    background: 'transparent',
    color: 'var(--color-text-muted)',
    fontSize: '13px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  kanban: {
    display: 'flex',
    gap: '16px',
    flex: 1,
    overflow: 'auto',
    alignItems: 'flex-start',
  },
  column: {
    width: '280px',
    minWidth: '280px',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
    maxHeight: 'calc(100vh - 220px)',
  },
  columnHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 14px',
    borderBottom: '1px solid var(--color-border)',
    background: 'var(--color-surface)',
    flexShrink: 0,
  },
  columnTitle: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--color-text)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  countBadge: {
    fontSize: '11px',
    fontWeight: '600',
    padding: '1px 6px',
    borderRadius: '10px',
    background: 'var(--color-border)',
    color: 'var(--color-text-muted)',
  },
  statusDot: {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
  },
  columnBody: {
    padding: '10px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    overflowY: 'auto' as const,
    flex: 1,
  },
  dropZone: {
    border: '2px dashed var(--color-border)',
    borderRadius: '8px',
    padding: '20px',
    textAlign: 'center' as const,
    color: 'var(--color-text-muted)',
    fontSize: '12px',
    minHeight: '60px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ticketCard: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    padding: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    transition: 'box-shadow 150ms ease',
    userSelect: 'none' as const,
  },
  ticketId: {
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--color-text-muted)',
    fontFamily: 'monospace',
  },
  ticketTitle: {
    fontSize: '13px',
    fontWeight: '500',
    color: 'var(--color-text)',
    margin: 0,
    lineHeight: 1.4,
  },
  ticketFooter: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap' as const,
  },
  dragHandle: {
    cursor: 'grab',
    display: 'flex',
    alignItems: 'center',
    padding: '2px',
    borderRadius: '3px',
    transition: 'background 100ms ease',
  },
  tableWrapper: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    overflow: 'auto',
    flex: 1,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    fontSize: '13px',
  },
  th: {
    textAlign: 'left' as const,
    padding: '10px 16px',
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    borderBottom: '1px solid var(--color-border)',
    cursor: 'pointer',
    background: 'var(--color-background)',
    userSelect: 'none' as const,
    whiteSpace: 'nowrap' as const,
  },
  tr: {
    borderBottom: '1px solid var(--color-border)',
    transition: 'background 100ms ease',
  },
  td: {
    padding: '10px 16px',
    verticalAlign: 'middle',
    whiteSpace: 'nowrap' as const,
  },
  center: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: '8px',
  },
} as const
