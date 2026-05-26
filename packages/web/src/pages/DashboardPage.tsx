import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Activity, AlertCircle, CheckCircle2, FolderKanban, Loader2, Plus, ShieldAlert } from 'lucide-react'
import { fetchProjects, fetchTickets } from '../api/client'
import type { Project, ProjectHealthStatus, Ticket, TicketCounts } from '../types'

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
        <span style={{ color: 'var(--color-on-surface-variant)', marginTop: '12px', fontSize: '13px' }}>Loading projects...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div style={styles.center}>
        <AlertCircle size={24} style={{ color: 'var(--color-error)' }} />
        <span style={{ color: 'var(--color-error)', marginTop: '12px', fontSize: '13px' }}>
          Could not reach server. Is <code>loci serve</code> running?
        </span>
      </div>
    )
  }

  const totals = projects.reduce(
    (acc, project) => {
      acc.open += project.openTicketCount ?? 0
      acc.review += project.reviewTicketCount ?? 0
      acc.validation += project.validationFailureCount ?? 0
      return acc
    },
    { open: 0, review: 0, validation: 0 }
  )

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h1 id="dashboard-heading" style={styles.heading}>Active Projects</h1>
          <p style={styles.subheading}>
            {projects.length === 0
              ? 'No projects yet'
              : `${projects.length} project${projects.length === 1 ? '' : 's'}`}
          </p>
        </div>

        <div style={styles.headerMetrics}>
          <Metric icon={<Activity size={14} />} label={`${totals.open} open`} />
          <Metric icon={<CheckCircle2 size={14} />} label={`${totals.review} in review`} />
          <Metric
            icon={<ShieldAlert size={14} />}
            label={`${totals.validation} validation failing`}
            tone={totals.validation > 0 ? 'danger' : 'neutral'}
          />
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

function Metric({ icon, label, tone = 'neutral' }: { icon: ReactNode; label: string; tone?: 'neutral' | 'danger' }) {
  return (
    <span
      style={{
        ...styles.metric,
        color: tone === 'danger' ? 'var(--color-error)' : 'var(--color-on-surface-variant)',
      }}
    >
      {icon}
      {label}
    </span>
  )
}

function ProjectCard({ project, onOpen }: { project: Project; onOpen: () => void }) {
  const hasSummary = project.openTicketCount !== undefined
  const { data: tickets = [] } = useQuery<Ticket[]>({
    queryKey: ['tickets', project.id],
    queryFn: () => fetchTickets(project.id),
    enabled: !hasSummary,
  })

  const counts = project.ticketStatusCounts ?? countTickets(tickets)
  const openCount = project.openTicketCount ?? tickets.filter((ticket) => normalizedStatus(ticket.status) !== 'done').length
  const reviewCount = project.reviewTicketCount ?? counts.in_review
  const validationFailures = project.validationFailureCount ?? tickets.filter((ticket) => ticket.validationState === 'failing').length
  const available = project.available !== false
  const total = hasSummary ? openCount + counts.done : tickets.length
  const donePercent = total > 0 ? Math.round((counts.done / total) * 100) : 0

  return (
    <div
      id={`project-card-${project.id}`}
      style={{
        ...styles.card,
        ...(available ? {} : styles.unavailableCard),
      }}
      onClick={() => {
        if (available) onOpen()
      }}
      onMouseEnter={(e) => {
        if (!available) return
        e.currentTarget.style.boxShadow = '0 4px 20px rgba(25, 28, 30, 0.06)'
        e.currentTarget.style.borderColor = 'rgba(188, 201, 198, 0.2)'
      }}
      onMouseLeave={(e) => {
        if (!available) return
        e.currentTarget.style.boxShadow = 'none'
        e.currentTarget.style.borderColor = 'transparent'
      }}
    >
      <div style={styles.cardTopRow}>
        <div style={styles.cardIconContainer}>
          <FolderKanban size={20} color="var(--color-primary)" />
        </div>
        <HealthBadge status={project.healthStatus ?? 'healthy'} />
      </div>

      <h3 style={styles.projectName}>{project.name}</h3>
      <p style={styles.projectDesc}>
        {project.prefix}
      </p>
      {project.path && <p style={styles.projectPath}>{project.path}</p>}

      <div style={styles.capsuleRow}>
        <StatusCapsule label="Open" count={openCount} variant="open" />
        <StatusCapsule label="Review" count={reviewCount} variant="review" />
        <StatusCapsule label="Validation" count={validationFailures} variant={validationFailures > 0 ? 'danger' : 'done'} />
        <StatusCapsule label="Done" count={counts.done} variant="done" />
      </div>

      {!available && project.unavailableReason && (
        <p style={styles.unavailableReason}>{project.unavailableReason}</p>
      )}

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

function countTickets(tickets: Ticket[]): TicketCounts {
  return tickets.reduce(
    (acc, ticket) => {
      const status = normalizedStatus(ticket.status)
      if (status === 'idea') acc.idea++
      else if (status === 'shaped') acc.shaped++
      else if (status === 'ready') acc.ready++
      else if (status === 'in_progress') acc.in_progress++
      else if (status === 'in_review') acc.in_review++
      else if (status === 'done') acc.done++
      return acc
    },
    { idea: 0, shaped: 0, ready: 0, in_progress: 0, in_review: 0, done: 0 }
  )
}

function normalizedStatus(status: Ticket['status']): Exclude<Ticket['status'], 'todo'> {
  return status === 'todo' ? 'idea' : status
}

function HealthBadge({ status }: { status: ProjectHealthStatus }) {
  const label = status[0].toUpperCase() + status.slice(1)
  const color =
    status === 'missing' || status === 'error'
      ? 'var(--color-error)'
      : status === 'warning'
        ? '#8a5a00'
        : 'var(--color-primary)'

  return (
    <span style={{ ...styles.healthBadge, color }}>
      {label}
    </span>
  )
}

function StatusCapsule({
  label,
  count,
  variant,
}: {
  label: string
  count: number
  variant: 'open' | 'review' | 'danger' | 'done'
}) {
  const capsuleStyles: Record<string, { bg: string; color: string }> = {
    open: { bg: 'var(--color-secondary-container)', color: 'var(--color-on-secondary-container)' },
    review: { bg: 'rgba(107, 216, 203, 0.2)', color: 'var(--color-primary)' },
    danger: { bg: 'rgba(186, 26, 26, 0.1)', color: 'var(--color-error)' },
    done: { bg: 'var(--color-surface-container-highest)', color: 'var(--color-on-surface-variant)' },
  }

  const s = capsuleStyles[variant]

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        padding: '4px 10px',
        borderRadius: '8px',
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
    flexWrap: 'wrap' as const,
  },
  headerMetrics: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap' as const,
    marginLeft: 'auto',
  },
  metric: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    minHeight: '32px',
    padding: '6px 10px',
    borderRadius: '8px',
    background: 'var(--color-surface-container-lowest)',
    border: '1px solid var(--color-outline-variant)',
    fontSize: '12px',
    fontWeight: '700',
  },
  heading: {
    fontSize: '1.5rem',
    fontWeight: '800',
    color: 'var(--color-on-surface)',
    margin: 0,
    letterSpacing: '0',
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
    minHeight: '40px',
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
    borderRadius: '8px',
    padding: '24px',
    cursor: 'pointer',
    transition: 'all 300ms ease',
    boxShadow: 'none',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '4px',
  },
  unavailableCard: {
    borderColor: 'rgba(186, 26, 26, 0.22)',
    cursor: 'default',
  },
  cardTopRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '12px',
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
  healthBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    minHeight: '24px',
    padding: '3px 8px',
    borderRadius: '8px',
    background: 'var(--color-surface-container-high)',
    fontSize: '11px',
    fontWeight: '800',
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
    margin: '0 0 4px',
    lineHeight: 1.5,
    overflowWrap: 'anywhere' as const,
  },
  projectPath: {
    fontSize: '12px',
    color: 'var(--color-on-surface-variant)',
    margin: '0 0 18px',
    lineHeight: 1.4,
    overflowWrap: 'anywhere' as const,
  },
  capsuleRow: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '8px',
    marginBottom: '20px',
  },
  unavailableReason: {
    color: 'var(--color-error)',
    fontSize: '12px',
    lineHeight: 1.4,
    margin: '-8px 0 16px',
    overflowWrap: 'anywhere' as const,
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
