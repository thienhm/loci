import type { ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { LayoutDashboard, FolderKanban, Plus } from 'lucide-react'
import { fetchProjects } from '../api/client'
import type { Project } from '../types'

interface AppShellProps {
  children: ReactNode
}

export function AppShell({ children }: AppShellProps) {
  const { projectId } = useParams()
  const navigate = useNavigate()

  const { data: projects = [] } = useQuery<Project[]>({
    queryKey: ['projects'],
    queryFn: fetchProjects,
  })

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Sidebar — Level 1: surface_container */}
      <aside
        id="loci-sidebar"
        style={{
          width: '220px',
          minWidth: '220px',
          background: '#e2e5e8',
          display: 'flex',
          flexDirection: 'column',
          padding: '16px 0',
          gap: '4px',
          /* Darker than surface_container to separate from content bg */
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '0 16px 16px',
            marginBottom: '8px',
          }}
        >
          <img src="/favicon.svg" alt="Loci Logo" style={{ width: '32px', height: '32px', borderRadius: '6px' }} />
          <div>
            <span style={{ fontWeight: '600', fontSize: '18px', color: 'var(--color-primary)', letterSpacing: '-0.02em' }}>
              Loci
            </span>
            <p style={{ fontSize: '10px', color: 'var(--color-on-surface-variant)', opacity: 0.7, margin: 0 }}>
              Local-First Sync
            </p>
          </div>
        </div>

        {/* Dashboard link */}
        <SidebarLink
          to="/"
          icon={<LayoutDashboard size={15} />}
          label="Dashboard"
          active={!projectId && location.pathname === '/'}
        />

        {/* Projects section */}
        {projects.length > 0 && (
          <>
            <div
              style={{
                padding: '16px 16px 4px',
                fontSize: '11px',
                fontWeight: '600',
                color: 'var(--color-on-surface-variant)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Projects
            </div>
            {projects.map((p) => (
              <SidebarLink
                key={p.id}
                to={`/project/${p.id}`}
                icon={<FolderKanban size={15} />}
                label={p.name}
                badge={p.prefix}
                active={projectId === p.id}
              />
            ))}
          </>
        )}

        {/* New project button */}
        <div style={{ marginTop: 'auto', padding: '8px 12px 0' }}>
          <button
            id="new-project-btn"
            onClick={() => navigate('/')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              width: '100%',
              padding: '8px 8px',
              borderRadius: '6px',
              border: '1px dashed var(--color-outline-variant)',
              background: 'transparent',
              color: 'var(--color-on-surface-variant)',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-primary)'
              e.currentTarget.style.color = 'var(--color-primary)'
              e.currentTarget.style.background = 'rgba(0, 104, 95, 0.05)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-outline-variant)'
              e.currentTarget.style.color = 'var(--color-on-surface-variant)'
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <Plus size={13} />
            New Project
          </button>
        </div>
      </aside>

      {/* Main content — Level 2: surface_container_lowest (implied by page bg) */}
      <main
        id="loci-main"
        style={{
          flex: 1,
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {children}
      </main>
    </div>
  )
}

function SidebarLink({
  to,
  icon,
  label,
  badge,
  active,
}: {
  to: string
  icon: ReactNode
  label: string
  badge?: string
  active: boolean
}) {
  return (
    <Link
      to={to}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        padding: '7px 12px',
        margin: '0 6px',
        borderRadius: '6px',
        textDecoration: 'none',
        fontSize: '13px',
        fontWeight: active ? '600' : '500',
        color: active ? 'var(--color-primary)' : 'var(--color-on-surface)',
        background: active ? 'rgba(0, 104, 95, 0.08)' : 'transparent',
        transition: 'background var(--transition-fast), color var(--transition-fast)',
        letterSpacing: '-0.01em',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = 'var(--color-surface-container-highest)'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent'
      }}
    >
      <span style={{ color: active ? 'var(--color-primary)' : 'var(--color-on-surface-variant)', flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      {badge && (
        <span
          style={{
            fontSize: '10px',
            fontWeight: '700',
            padding: '1px 5px',
            borderRadius: '4px',
            background: active ? 'var(--color-primary)' : 'var(--color-surface-container-high)',
            color: active ? '#fff' : 'var(--color-on-surface-variant)',
          }}
        >
          {badge}
        </span>
      )}
    </Link>
  )
}
