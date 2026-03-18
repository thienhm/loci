import { useState, useMemo, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  rectIntersection,
  useDroppable,
} from '@dnd-kit/core'
import type { DragEndEvent, DragStartEvent, DragOverEvent } from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable'
import type { CollisionDetection } from '@dnd-kit/core'
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
  Archive,
  CheckSquare,
  X,
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

function getStoredViewMode(projectId: string | undefined): ViewMode {
  if (!projectId) return 'kanban'
  try {
    const stored = localStorage.getItem(`loci:viewMode:${projectId}`)
    if (stored === 'kanban' || stored === 'list') return stored
  } catch { /* localStorage unavailable */ }
  return 'kanban'
}

export function ProjectBoardPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const queryClient = useQueryClient()
  const [viewMode, setViewModeState] = useState<ViewMode>(() => getStoredViewMode(projectId))
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null)
  const [overColumnId, setOverColumnId] = useState<TicketStatus | null>(null)
  const [showNewTicket, setShowNewTicket] = useState(false)
  const [newTicketTitle, setNewTicketTitle] = useState('')
  const [sortField, setSortField] = useState<SortField>('updatedAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [showArchived, setShowArchived] = useState(false)
  const [selectMode, setSelectMode] = useState(false)
  const [selectedTickets, setSelectedTickets] = useState<Set<string>>(new Set())

  const setViewMode = useCallback((mode: ViewMode) => {
    setViewModeState(mode)
    if (projectId) {
      try { localStorage.setItem(`loci:viewMode:${projectId}`, mode) } catch { /* noop */ }
    }
  }, [projectId])

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
    queryFn: () => fetchTickets(projectId!, { archived: 'all' }),
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

  const bulkArchiveMutation = useMutation({
    mutationFn: async (ticketIds: string[]) => {
      await Promise.all(ticketIds.map(id => updateTicket(projectId!, id, { archived: true })))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tickets', projectId] })
      setSelectedTickets(new Set())
    },
  })

  // Show all tickets, archived sorted to bottom. Toggle hides/shows archived.
  const visibleTickets = useMemo(() => {
    const filtered = showArchived ? tickets : tickets.filter(t => !t.archived)
    return [...filtered].sort((a, b) => Number(a.archived ?? false) - Number(b.archived ?? false))
  }, [tickets, showArchived])

  function toggleSelect(ticketId: string) {
    setSelectedTickets(prev => {
      const next = new Set(prev)
      if (next.has(ticketId)) next.delete(ticketId)
      else next.add(ticketId)
      return next
    })
  }

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  function handleDragStart(event: DragStartEvent) {
    const ticket = tickets.find((t) => t.id === event.active.id)
    if (ticket) setActiveTicket(ticket)
  }

  function handleDragOver(event: DragOverEvent) {
    const { over } = event
    if (!over) { setOverColumnId(null); return }
    // Check if hovering over a column directly
    const col = COLUMNS.find((c) => c.id === over.id)
    if (col) { setOverColumnId(col.id); return }
    // Hovering over a ticket card — resolve its column
    const overTicket = tickets.find((t) => t.id === over.id)
    if (overTicket) { setOverColumnId(overTicket.status); return }
    setOverColumnId(null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTicket(null)
    setOverColumnId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    // Determine target column — either directly from column id or by finding
    // which column the hovered ticket belongs to
    let targetStatus = COLUMNS.find((c) => c.id === over.id)?.id
    if (!targetStatus) {
      // Dropped over a ticket card — find its column
      const overTicket = tickets.find((t) => t.id === over.id)
      if (overTicket) targetStatus = overTicket.status
    }
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

          {/* Show archived toggle */}
          <ToggleButton
            id="toggle-archived-btn"
            active={showArchived}
            onClick={() => { setShowArchived(v => !v); setSelectedTickets(new Set()) }}
            icon={<Archive size={14} />}
            label="Archived"
          />

          {/* Select mode toggle */}
          <ToggleButton
            id="toggle-select-btn"
            active={selectMode}
            onClick={() => { setSelectMode(v => !v); setSelectedTickets(new Set()) }}
            icon={<CheckSquare size={14} />}
            label="Select"
          />

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
          collisionDetection={rectIntersection as CollisionDetection}
          onDragStart={handleDragStart}
          onDragOver={handleDragOver}
          onDragEnd={handleDragEnd}
        >
          <div style={styles.kanban}>
            {COLUMNS.map((col) => {
              const colTickets = visibleTickets
                .filter((t) => t.status === col.id)
                .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
              return (
                <KanbanColumn
                  key={col.id}
                  column={col}
                  tickets={colTickets}
                  projectId={projectId!}
                  isHighlighted={overColumnId === col.id}
                  selectMode={selectMode}
                  selectedTickets={selectedTickets}
                  onToggleSelect={toggleSelect}
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
          tickets={visibleTickets}
          projectId={projectId!}
          sortField={sortField}
          sortDir={sortDir}
          onSort={(field) => {
            if (field === sortField) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
            else { setSortField(field); setSortDir('asc') }
          }}
          selectMode={selectMode}
          selectedTickets={selectedTickets}
          onToggleSelect={toggleSelect}
        />
      )}

      {/* Floating bulk action bar */}
      {selectedTickets.size > 0 && (
        <div style={styles.floatingBar}>
          <span>{selectedTickets.size} selected</span>
          <button
            onClick={() => bulkArchiveMutation.mutate([...selectedTickets])}
            disabled={bulkArchiveMutation.isPending}
            style={styles.floatingBarBtn}
          >
            <Archive size={14} />
            {bulkArchiveMutation.isPending ? 'Archiving…' : 'Archive'}
          </button>
          <button
            onClick={() => setSelectedTickets(new Set())}
            style={{ ...styles.floatingBarBtn, background: 'rgba(255,255,255,0.15)' }}
          >
            <X size={14} />
            Cancel
          </button>
        </div>
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
  isHighlighted,
  selectMode,
  selectedTickets,
  onToggleSelect,
}: {
  column: { id: TicketStatus; label: string }
  tickets: Ticket[]
  projectId: string
  isHighlighted: boolean
  selectMode: boolean
  selectedTickets: Set<string>
  onToggleSelect: (ticketId: string) => void
}) {
  const { setNodeRef } = useDroppable({ id: column.id })

  return (
    <div
      ref={setNodeRef}
      id={`kanban-col-${column.id}`}
      style={{
        ...styles.column,
        background: isHighlighted ? '#F0FDFA' : 'var(--color-background)',
        borderColor: isHighlighted ? 'var(--color-primary)' : 'var(--color-border)',
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
            <SortableTicketCard
              key={ticket.id}
              ticket={ticket}
              projectId={projectId}
              selectMode={selectMode}
              isSelected={selectedTickets.has(ticket.id)}
              onToggleSelect={onToggleSelect}
            />
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

function SortableTicketCard({
  ticket,
  projectId,
  selectMode,
  isSelected,
  onToggleSelect,
}: {
  ticket: Ticket
  projectId: string
  selectMode: boolean
  isSelected: boolean
  onToggleSelect: (ticketId: string) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: ticket.id,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : ticket.archived ? 0.5 : 1,
  }

  return (
    <div ref={setNodeRef} style={style} {...attributes}>
      <TicketCard
        ticket={ticket}
        projectId={projectId}
        dragHandleProps={listeners}
        selectMode={selectMode}
        isSelected={isSelected}
        onToggleSelect={onToggleSelect}
      />
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
  selectMode,
  isSelected,
  onToggleSelect,
}: {
  ticket: Ticket
  projectId: string
  isDragging?: boolean
  dragHandleProps?: Record<string, unknown>
  selectMode?: boolean
  isSelected?: boolean
  onToggleSelect?: (ticketId: string) => void
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
        ...(isSelected ? { borderColor: 'var(--color-primary)', background: '#F0FDFA' } : {}),
      }}
    >
      {/* Top row: checkbox + drag handle + ID (left), priority + assignee (right) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {selectMode && onToggleSelect && (
            <input
              type="checkbox"
              checked={isSelected ?? false}
              onChange={(e) => { e.stopPropagation(); onToggleSelect(ticket.id) }}
              onClick={(e) => e.stopPropagation()}
              style={{ accentColor: 'var(--color-primary)', cursor: 'pointer', margin: 0 }}
            />
          )}
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
          {ticket.archived && (
            <span style={styles.archivedBadge}>Archived</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <PriorityBadge priority={ticket.priority} />
          {ticket.assignee && <AssigneeBadge assignee={ticket.assignee} />}
        </div>
      </div>

      {/* Title */}
      <p style={styles.ticketTitle}>{ticket.title}</p>

      {/* Labels */}
      {ticket.labels.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {ticket.labels.map((label) => (
            <span
              key={label}
              style={{
                fontSize: '11px',
                fontWeight: '600',
                padding: '2px 8px',
                borderRadius: '20px',
                background: '#CCFBF1',
                color: 'var(--color-primary)',
              }}
            >
              {label}
            </span>
          ))}
        </div>
      )}
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
  selectMode,
  selectedTickets,
  onToggleSelect,
}: {
  tickets: Ticket[]
  projectId: string
  sortField: SortField
  sortDir: SortDir
  onSort: (field: SortField) => void
  selectMode: boolean
  selectedTickets: Set<string>
  onToggleSelect: (ticketId: string) => void
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
            {selectMode && <th style={{ ...styles.th, width: '36px', cursor: 'default' }}></th>}
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
              style={{
                ...styles.tr,
                opacity: ticket.archived ? 0.5 : 1,
                ...(selectedTickets.has(ticket.id) ? { background: '#F0FDFA' } : {}),
              }}
              onMouseEnter={(e) => { if (!selectedTickets.has(ticket.id)) e.currentTarget.style.background = '#F8FFFE' }}
              onMouseLeave={(e) => { if (!selectedTickets.has(ticket.id)) e.currentTarget.style.background = '' }}
            >
              {selectMode && (
                <td style={styles.td}>
                  <input
                    type="checkbox"
                    checked={selectedTickets.has(ticket.id)}
                    onChange={() => onToggleSelect(ticket.id)}
                    style={{ accentColor: 'var(--color-primary)', cursor: 'pointer', margin: 0 }}
                  />
                </td>
              )}
              <td style={styles.td}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Link
                    to={`/project/${projectId}/${ticket.id}`}
                    style={{ ...styles.ticketId, textDecoration: 'none' }}
                  >
                    {ticket.id}
                  </Link>
                  {ticket.archived && <span style={styles.archivedBadge}>Archived</span>}
                </div>
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
  },
  column: {
    width: '280px',
    minWidth: '280px',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
    minHeight: 0,
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
  archivedBadge: {
    fontSize: '9px',
    fontWeight: '700',
    padding: '1px 5px',
    borderRadius: '3px',
    background: '#FEF3C7',
    color: '#92400E',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  floatingBar: {
    position: 'fixed' as const,
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 20px',
    background: 'var(--color-text)',
    color: '#fff',
    borderRadius: '12px',
    boxShadow: '0 8px 32px rgba(0,0,0,0.2)',
    zIndex: 1000,
    fontSize: '13px',
    fontWeight: '600',
  },
  floatingBarBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '6px 12px',
    borderRadius: '6px',
    border: 'none',
    background: 'var(--color-primary)',
    color: '#fff',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
} as const
