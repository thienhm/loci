import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { FolderKanban, Plus, AlertCircle, Loader2 } from 'lucide-react'
import { fetchProjects, fetchTickets } from '../api/client'
import type { Project, Ticket, TicketCounts } from '../types'

export function DashboardPage() {
  const navigate = useNavigate()

  const { data: projects = [], isLoading, error } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  })

  if (isLoading) {
    return (
      <div style={styles.center}>
        <Loader2 size={24} style={{ color: 'var(--color-primary)', animation: 'spin 1s linear infinite' }} />
        <span style={{ color: 'var(--color-text-muted)', marginTop: '12px' }}>Loading projects…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={styles.center}>
        <AlertCircle size={24} style={{ color: 'var(--color-priority-high)' }} />
        <span style={{ color: 'var(--color-priority-high)', marginTop: '12px' }}>
          Could not reach server — is <code>loci serve</code> running?
        </span>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      {/* Page header */}
      <div style={styles.header}>
        <div>
          <h1 id="dashboard-heading" style={styles.heading}>All Projects</h1>
          <p style={styles.subheading}>
            {projects.length === 0
              ? 'No projects yet'
              : `${projects.length} project${projects.length === 1 ? '' : 's'}`}
          </p>
        </div>
      </div>

      {/* Project grid */}
      {projects.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={styles.grid}>
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onOpen={() => navigate(`/project/${project.id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Project card
// ─────────────────────────────────────────────────────────────────────────────

function ProjectCard({ project, onOpen }: { project: Project; onOpen: () => void }) {
  const { data: tickets = [] } = useQuery<Ticket[]>({
    queryKey: ['tickets', project.id],
    queryFn: () => fetchTickets(project.id),
  })

  const counts: TicketCounts = tickets.reduce(
    (acc, t) => {
      if (t.status === 'todo') acc.todo++
      else if (t.status === 'in_progress') acc.in_progress++
      else if (t.status === 'in_review') acc.in_review++
      else if (t.status === 'done') acc.done++
      return acc
    },
    { todo: 0, in_progress: 0, in_review: 0, done: 0 }
  )

  const total = tickets.length

  return (
    <div
      id={`project-card-${project.id}`}
      style={styles.card}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 8px 24px rgba(13, 148, 136, 0.12)'
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.borderColor = 'var(--color-primary)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.borderColor = 'var(--color-border)'
      }}
    >
      {/* Card header */}
      <div style={styles.cardHeader}>
        <div style={styles.cardIcon}>
          <FolderKanban size={18} color="#fff" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={styles.projectName}>{project.name}</div>
          <div style={styles.prefixBadge}>{project.prefix}</div>
        </div>
      </div>

      {/* Ticket counts */}
      <div style={styles.countsRow}>
        <CountPill
          label="Todo"
          count={counts.todo}
          color="var(--color-status-todo)"
          dotColor="#94A3B8"
        />
        <CountPill
          label="In Progress"
          count={counts.in_progress}
          color="var(--color-status-in-progress)"
          dotColor="#3B82F6"
        />
        <CountPill
          label="Done"
          count={counts.done}
          color="var(--color-status-done)"
          dotColor="#22C55E"
        />
      </div>

      {/* Progress bar */}
      {total > 0 && (
        <div style={styles.progressBarBg}>
          <div
            style={{
              ...styles.progressBarFill,
              width: `${Math.round((counts.done / total) * 100)}%`,
            }}
          />
        </div>
      )}

      {/* Footer */}
      <div style={styles.cardFooter}>
        <span style={{ color: 'var(--color-text-muted)', fontSize: '12px' }}>
          {total} ticket{total !== 1 ? 's' : ''}
        </span>
        <button
          id={`open-board-${project.id}`}
          onClick={onOpen}
          style={styles.openButton}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--color-primary)'
            e.currentTarget.style.color = '#fff'
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'transparent'
            e.currentTarget.style.color = 'var(--color-primary)'
          }}
        >
          Open Board →
        </button>
      </div>
    </div>
  )
}

function CountPill({
  label,
  count,
  dotColor,
}: {
  label: string
  count: number
  color: string
  dotColor: string
}) {
  return (
    <div style={styles.pill}>
      <div
        style={{
          width: '7px',
          height: '7px',
          borderRadius: '50%',
          background: dotColor,
          flexShrink: 0,
        }}
      />
      <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{label}</span>
      <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-text)', marginLeft: 'auto' }}>
        {count}
      </span>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={styles.emptyState}>
      <div style={styles.emptyIcon}>
        <Plus size={28} color="var(--color-text-muted)" />
      </div>
      <h2 style={{ fontSize: '18px', fontWeight: '600', color: 'var(--color-text)', margin: '0 0 8px' }}>
        No projects yet
      </h2>
      <p style={{ color: 'var(--color-text-muted)', fontSize: '14px', margin: 0, textAlign: 'center', maxWidth: '320px' }}>
        Run <code style={{ background: '#E2E8F0', padding: '2px 6px', borderRadius: '4px', fontSize: '13px' }}>loci init</code> in a workspace folder to create your first project.
      </p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = {
  page: {
    padding: '32px 36px',
    maxWidth: '1100px',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: '28px',
  },
  heading: {
    fontSize: '22px',
    fontWeight: '700',
    color: 'var(--color-text)',
    margin: 0,
  },
  subheading: {
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    margin: '4px 0 0',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
    gap: '16px',
  },
  card: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    padding: '20px',
    cursor: 'pointer',
    transition: 'all 150ms ease',
    boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  cardHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  cardIcon: {
    width: '36px',
    height: '36px',
    borderRadius: '8px',
    background: 'var(--color-primary)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  projectName: {
    fontSize: '15px',
    fontWeight: '600',
    color: 'var(--color-text)',
    lineHeight: 1.3,
  },
  prefixBadge: {
    display: 'inline-block',
    fontSize: '10px',
    fontWeight: '700',
    letterSpacing: '0.05em',
    padding: '1px 6px',
    borderRadius: '4px',
    background: '#CCFBF1',
    color: 'var(--color-primary)',
    marginTop: '3px',
  },
  countsRow: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  pill: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  progressBarBg: {
    height: '4px',
    background: 'var(--color-border)',
    borderRadius: '2px',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    background: 'var(--color-status-done)',
    borderRadius: '2px',
    transition: 'width 300ms ease',
  },
  cardFooter: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  openButton: {
    background: 'transparent',
    border: '1px solid var(--color-primary)',
    color: 'var(--color-primary)',
    padding: '5px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 150ms ease',
    fontFamily: 'inherit',
  },
  center: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: '8px',
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '64px 24px',
    gap: '12px',
  },
  emptyIcon: {
    width: '60px',
    height: '60px',
    borderRadius: '16px',
    background: 'var(--color-border)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '8px',
  },
} as const
