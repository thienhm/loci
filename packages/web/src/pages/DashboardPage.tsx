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
        <span style={{ color: 'var(--color-on-surface-variant)', marginTop: '12px', fontSize: '13px' }}>Loading projects…</span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={styles.center}>
        <AlertCircle size={24} style={{ color: 'var(--color-error)' }} />
        <span style={{ color: 'var(--color-error)', marginTop: '12px', fontSize: '13px' }}>
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
          <h1 id="dashboard-heading" style={styles.heading}>Active Projects</h1>
          <p style={styles.subheading}>
            {projects.length === 0
              ? 'No projects yet'
              : `${projects.length} project${projects.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <button
          id="new-project-cta"
          onClick={() => navigate('/')}
          style={styles.newProjectBtn}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          <Plus size={16} />
          New Project
        </button>
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
  const donePercent = total > 0 ? Math.round((counts.done / total) * 100) : 0

  return (
    <div
      id={`project-card-${project.id}`}
      style={styles.card}
      onClick={onOpen}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 20px rgba(25, 28, 30, 0.06)'
        e.currentTarget.style.borderColor = 'rgba(188, 201, 198, 0.2)'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.borderColor = 'transparent'
      }}
    >
      {/* Card icon */}
      <div style={styles.cardIconContainer}>
        <FolderKanban size={20} color="var(--color-primary)" />
      </div>

      {/* Project name & description */}
      <h3 style={styles.projectName}>{project.name}</h3>
      <p style={styles.projectDesc}>
        {project.prefix} · {total} ticket{total !== 1 ? 's' : ''}
      </p>

      {/* Status capsules */}
      <div style={styles.capsuleRow}>
        <StatusCapsule label="Todo" count={counts.todo} variant="todo" />
        <StatusCapsule label="In Progress" count={counts.in_progress} variant="in_progress" />
        <StatusCapsule label="Done" count={counts.done} variant="done" />
      </div>

      {/* Progress bar */}
      <div style={styles.progressSection}>
        <div style={styles.progressMeta}>
          <span>Progress</span>
          <span>{donePercent}%</span>
        </div>
        <div style={styles.progressTrack}>
          <div
            style={{
              ...styles.progressFill,
              width: `${donePercent}%`,
            }}
          />
        </div>
      </div>
    </div>
  )
}

function StatusCapsule({
  label,
  count,
  variant,
}: {
  label: string
  count: number
  variant: 'todo' | 'in_progress' | 'done'
}) {
  const capsuleStyles: Record<string, { bg: string; color: string }> = {
    todo: { bg: 'var(--color-secondary-container)', color: 'var(--color-on-secondary-container)' },
    in_progress: { bg: 'rgba(107, 216, 203, 0.2)', color: 'var(--color-primary)' },
    done: { bg: 'var(--color-surface-container-highest)', color: 'var(--color-on-surface-variant)' },
  }

  const s = capsuleStyles[variant]

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        borderRadius: '9999px',
        fontSize: '10px',
        fontWeight: '700',
        background: s.bg,
        color: s.color,
      }}
    >
      {label}: {count}
    </span>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div style={styles.emptyState}>
      <div style={styles.emptyIcon}>
        <Plus size={28} color="var(--color-on-surface-variant)" />
      </div>
      <h2 style={{ fontSize: '16px', fontWeight: '600', color: 'var(--color-on-surface)', margin: '0 0 8px' }}>
        No projects yet
      </h2>
      <p style={{ color: 'var(--color-on-surface-variant)', fontSize: '13px', margin: 0, textAlign: 'center', maxWidth: '320px' }}>
        Run <code style={{ background: 'var(--color-surface-container-high)', padding: '2px 6px', borderRadius: '4px', fontSize: '12px' }}>loci init</code> in a workspace folder to create your first project.
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
    maxWidth: '1200px',
    background: 'var(--color-surface-container-low)',
    minHeight: '100%',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginBottom: '32px',
    gap: '16px',
  },
  heading: {
    fontSize: '1.5rem',
    fontWeight: '800',
    color: 'var(--color-on-surface)',
    margin: 0,
    letterSpacing: '-0.02em',
  },
  subheading: {
    fontSize: '12px',
    color: 'var(--color-on-surface-variant)',
    margin: '4px 0 0',
    fontWeight: '500',
  },
  newProjectBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '10px 20px',
    borderRadius: '8px',
    border: 'none',
    background: 'linear-gradient(135deg, var(--color-primary), var(--color-primary-container))',
    color: 'var(--color-on-primary)',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'opacity var(--transition-fast)',
    fontFamily: 'inherit',
    boxShadow: '0 1px 4px rgba(0, 104, 95, 0.15)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
    gap: '24px',
  },
  card: {
    background: 'var(--color-surface-container-lowest)',
    border: '1px solid transparent',
    borderRadius: '12px',
    padding: '24px',
    cursor: 'pointer',
    transition: 'all 300ms ease',
    boxShadow: 'none',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  cardIconContainer: {
    width: '40px',
    height: '40px',
    borderRadius: '8px',
    background: 'rgba(0, 104, 95, 0.08)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '12px',
  },
  projectName: {
    fontSize: '16px',
    fontWeight: '600',
    color: 'var(--color-on-surface)',
    lineHeight: 1.3,
    margin: '0 0 4px',
  },
  projectDesc: {
    fontSize: '13px',
    color: 'var(--color-on-surface-variant)',
    margin: '0 0 20px',
    lineHeight: 1.5,
  },
  capsuleRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '8px',
    marginBottom: '20px',
  },
  progressSection: {
    marginTop: 'auto',
  },
  progressMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '11px',
    fontWeight: '500',
    color: 'var(--color-on-surface-variant)',
    marginBottom: '6px',
  },
  progressTrack: {
    height: '6px',
    background: 'var(--color-surface-container-high)',
    borderRadius: '9999px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'var(--color-primary)',
    borderRadius: '9999px',
    transition: 'width 1000ms ease',
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
    borderRadius: '50%',
    background: 'var(--color-surface-container-high)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '8px',
  },
} as const
