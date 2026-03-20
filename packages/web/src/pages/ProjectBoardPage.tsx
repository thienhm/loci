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
  GripVertical as _GripVertical,
  Archive,
  CheckSquare,
  X,
  MoreHorizontal,
} from 'lucide-react'
import { fetchProject, fetchTickets, updateTicket, createTicket } from '../api/client'
import { useSSE } from '../hooks/useSSE'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { FilterBar, applyFilters, EMPTY_FILTERS } from '../components/FilterBar'
import type { FilterState } from '../components/FilterBar'
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
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)

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
    queryKey: ['tickets', projectId, showArchived ? 'all' : 'active'],
    queryFn: () => fetchTickets(projectId!, showArchived ? { archived: 'all' } : undefined),
    enabled: !!projectId,
  })

  const invalidateTickets = () => queryClient.invalidateQueries({ queryKey: ['tickets', projectId] })

  const filteredTickets = useMemo(
    () => applyFilters(tickets, filters),
    [tickets, filters]
  )

  const updateMutation = useMutation({
    mutationFn: ({ ticketId, status }: { ticketId: string; status: TicketStatus }) =>
      updateTicket(projectId!, ticketId, { status }),
    onSuccess: invalidateTickets,
  })

  const createMutation = useMutation({
    mutationFn: (title: string) => createTicket(projectId!, { title }),
    onSuccess: () => {
      invalidateTickets()
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
      invalidateTickets()
      setSelectedTickets(new Set())
    },
  })

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
    const ticket = filteredTickets.find((t) => t.id === event.active.id)
    if (ticket) setActiveTicket(ticket)
  }

  function handleDragOver(event: DragOverEvent) {
    const { over } = event
    if (!over) { setOverColumnId(null); return }
    const col = COLUMNS.find((c) => c.id === over.id)
    if (col) { setOverColumnId(col.id); return }
    const overTicket = filteredTickets.find((t) => t.id === over.id)
    if (overTicket) { setOverColumnId(overTicket.status); return }
    setOverColumnId(null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveTicket(null)
    setOverColumnId(null)
    const { active, over } = event
    if (!over || active.id === over.id) return

    let targetStatus = COLUMNS.find((c) => c.id === over.id)?.id
    if (!targetStatus) {
      const overTicket = filteredTickets.find((t) => t.id === over.id)
      if (overTicket) targetStatus = overTicket.status
    }
    if (targetStatus) {
      const ticket = filteredTickets.find((t) => t.id === active.id)
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
    const isOffline = error instanceof TypeError && error.message.includes('fetch')
    return (
      <div style={styles.center}>
        <AlertCircle size={32} style={{ color: 'var(--color-error)', marginBottom: '12px' }} />
        <h2 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--color-on-surface)', margin: '0 0 6px' }}>
          {isOffline ? 'Cannot connect to Loci server' : 'Project not found'}
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)', margin: '0 0 16px', textAlign: 'center' }}>
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

  const totalTickets = filteredTickets.length

  return (
    <div style={styles.page}>
      {/* Row 1: Project name + task count */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '16px 0 8px' }}>
        <h1 id="board-heading" style={styles.heading}>
          {project.name}
        </h1>
        <span style={styles.prefixBadge}>{totalTickets} TASKS</span>
      </div>

      {/* Row 2: New Ticket + View toggle + Archived + Select */}
      <div style={styles.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* New ticket button */}
          <button
            id="new-ticket-btn"
            onClick={() => setShowNewTicket(true)}
            style={styles.newTicketBtn}
            onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
            onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
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
              label="Board"
            />
            <ToggleButton
              id="view-list-btn"
              active={viewMode === 'list'}
              onClick={() => setViewMode('list')}
              icon={<List size={14} />}
              label="List"
            />
          </div>

          {/* Archived toggle */}
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
        </div>
      </div>

      {/* Row 3: Search + Filters (single line) */}
      <div style={styles.topBar}>
        <FilterBar
          tickets={tickets}
          filters={filters}
          onChange={setFilters}
          onClear={() => setFilters(EMPTY_FILTERS)}
        />
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
              const colTickets = filteredTickets
                .filter((t) => t.status === col.id)
                .sort((a, b) => {
                  const aArch = a.archived ? 1 : 0
                  const bArch = b.archived ? 1 : 0
                  if (aArch !== bArch) return aArch - bArch
                  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
                })
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
          tickets={filteredTickets}
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
        background: isHighlighted ? 'rgba(0, 104, 95, 0.03)' : 'transparent',
        transition: 'background 150ms ease',
      }}
    >
      {/* Column header */}
      <div style={styles.columnHeader}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={styles.columnTitle}>{column.label}</span>
          <span style={styles.countBadge}>{tickets.length}</span>
        </div>
        <MoreHorizontal size={16} color="var(--color-on-surface-variant)" style={{ opacity: 0.5 }} />
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
              <Plus size={14} style={{ marginRight: '6px' }} />
              Add Ticket
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
          ? '0 4px 20px rgba(25, 28, 30, 0.06)'
          : 'none',
        cursor: isDragging ? 'grabbing' : 'grab',
        transform: isDragging ? 'rotate(2deg)' : 'none',
        ...(isSelected ? { background: 'rgba(0, 104, 95, 0.04)', boxShadow: '0 0 0 1px var(--color-primary)' } : {}),
      }}
    >
      {/* Ticket ID at top */}
      <Link
        to={`/project/${projectId}/${ticket.id}`}
        style={{ textDecoration: 'none' }}
        onClick={(e) => e.stopPropagation()}
      >
        <span style={{ fontSize: '11px', fontWeight: '600', color: 'var(--color-primary)', fontFamily: 'monospace' }}>{ticket.id}</span>
      </Link>

      {/* Labels */}
      {ticket.labels.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
          {ticket.labels.map((label) => (
            <span
              key={label}
              style={{
                fontSize: '10px',
                fontWeight: '700',
                padding: '2px 8px',
                borderRadius: '9999px',
                background: 'var(--color-secondary-container)',
                color: 'var(--color-on-secondary-container)',
              }}
            >
              {label}
            </span>
          ))}
        </div>
      )}

      {/* Title + ticket ID */}
      <Link
        to={`/project/${projectId}/${ticket.id}`}
        style={{ textDecoration: 'none' }}
        onClick={(e) => e.stopPropagation()}
      >
        <p style={styles.ticketTitle}>{ticket.title}</p>
      </Link>

      {/* Bottom row: ticket ID + priority + assignee */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}>
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
          <PriorityBadge priority={ticket.priority} />
          {ticket.archived && (
            <span style={styles.archivedBadge}>Archived</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {ticket.assignee && <AssigneeBadge assignee={ticket.assignee} />}
        </div>
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
    const aArch = a.archived ? 1 : 0
    const bArch = b.archived ? 1 : 0
    if (aArch !== bArch) return aArch - bArch
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
                ...(selectedTickets.has(ticket.id) ? { background: 'rgba(0, 104, 95, 0.04)' } : {}),
              }}
              onMouseEnter={(e) => { if (!selectedTickets.has(ticket.id)) e.currentTarget.style.background = 'var(--color-surface-container-highest)' }}
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
                <span style={{ fontSize: '13px', color: 'var(--color-on-surface)', fontWeight: '500' }}>
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
                <span style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)' }}>
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
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-on-surface-variant)', fontSize: '13px' }}>
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
        borderRadius: '9999px',
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
  high: '#924628',
  medium: '#F59E0B',
  low: '#94A3B8',
}

function PriorityBadge({ priority }: { priority: TicketPriority }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: '11px',
        fontWeight: '600',
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
        color: 'var(--color-on-surface-variant)',
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
        fontWeight: active ? '600' : '500',
        color: active ? 'var(--color-primary)' : 'var(--color-on-surface-variant)',
        background: active ? 'rgba(0, 104, 95, 0.08)' : 'transparent',
        border: 'none',
        borderRadius: '6px',
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
    gap: '16px',
    overflow: 'hidden',
    background: 'var(--color-surface-container-low)',
  },
  topBar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
    gap: '12px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexShrink: 0,
    flexWrap: 'wrap' as const,
    gap: '12px',
  },
  heading: {
    fontSize: '1.5rem',
    fontWeight: '800',
    color: 'var(--color-on-surface)',
    margin: 0,
    letterSpacing: '-0.02em',
  },
  prefixBadge: {
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '0.05em',
    padding: '3px 8px',
    borderRadius: '9999px',
    background: 'rgba(0, 104, 95, 0.08)',
    color: 'var(--color-primary)',
    display: 'inline-block',
  },
  headerActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap' as const,
  },
  newTicketBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '5px',
    padding: '8px 16px',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-container))',
    color: 'var(--color-on-primary)',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'opacity 150ms ease',
  },
  viewToggle: {
    display: 'flex',
    background: 'var(--color-surface-container-lowest)',
    border: '1px solid rgba(188, 201, 198, 0.3)',
    borderRadius: '8px',
    padding: '2px',
    gap: '2px',
  },
  newTicketForm: {
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
    padding: '12px 16px',
    background: 'var(--color-surface-container-lowest)',
    border: '2px solid var(--color-primary)',
    borderRadius: '10px',
    flexShrink: 0,
  },
  newTicketInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    fontSize: '14px',
    color: 'var(--color-on-surface)',
    background: 'transparent',
    fontFamily: 'inherit',
  },
  saveBtn: {
    padding: '6px 14px',
    borderRadius: '6px',
    border: 'none',
    background: 'var(--color-primary)',
    color: '#fff',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  cancelBtn: {
    padding: '6px 14px',
    borderRadius: '6px',
    border: '1px solid rgba(188, 201, 198, 0.3)',
    background: 'transparent',
    color: 'var(--color-on-surface-variant)',
    fontSize: '13px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  kanban: {
    display: 'flex',
    gap: '12px',
    flex: 1,
    overflow: 'auto',
  },
  column: {
    width: '280px',
    minWidth: '280px',
    borderRadius: '0',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
    minHeight: 0,
    /* No borders — tonal layering + spacing defines columns */
  },
  columnHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 10px',
    flexShrink: 0,
  },
  columnTitle: {
    fontSize: '13px',
    fontWeight: '600',
    color: 'var(--color-on-surface)',
    letterSpacing: '-0.01em',
  },
  countBadge: {
    fontSize: '11px',
    fontWeight: '600',
    padding: '1px 6px',
    borderRadius: '10px',
    background: 'var(--color-surface-container-high)',
    color: 'var(--color-on-surface-variant)',
  },
  columnBody: {
    padding: '4px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    overflowY: 'auto' as const,
    flex: 1,
  },
  dropZone: {
    border: '2px dashed rgba(188, 201, 198, 0.4)',
    borderRadius: '10px',
    padding: '20px',
    textAlign: 'center' as const,
    color: 'var(--color-on-surface-variant)',
    fontSize: '12px',
    fontWeight: '500',
    minHeight: '60px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'all 150ms ease',
  },
  ticketCard: {
    background: 'var(--color-surface-container-lowest)',
    border: 'none',
    borderRadius: '10px',
    padding: '14px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    transition: 'box-shadow 150ms ease',
    userSelect: 'none' as const,
    /* Ambient elevation via tonal contrast: white card on #f2f4f6 bg */
  },
  ticketId: {
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--color-on-surface-variant)',
    fontFamily: 'monospace',
  },
  ticketTitle: {
    fontSize: '13px',
    fontWeight: '500',
    color: 'var(--color-on-surface)',
    margin: 0,
    lineHeight: 1.4,
  },
  tableWrapper: {
    background: 'var(--color-surface-container-lowest)',
    borderRadius: '12px',
    overflow: 'auto',
    flex: 1,
    /* No border — tonal layering */
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
    color: 'var(--color-on-surface-variant)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
    borderBottom: '1px solid var(--color-surface-container-high)',
    cursor: 'pointer',
    background: 'var(--color-surface-container-low)',
    userSelect: 'none' as const,
    whiteSpace: 'nowrap' as const,
  },
  tr: {
    borderBottom: '1px solid var(--color-surface-container-high)',
    transition: 'background 100ms ease',
  },
  td: {
    padding: '10px 16px',
    verticalAlign: 'middle' as const,
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
    background: 'rgba(25, 28, 30, 0.9)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    color: '#fff',
    borderRadius: '12px',
    boxShadow: '0 4px 20px rgba(25, 28, 30, 0.12)',
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
