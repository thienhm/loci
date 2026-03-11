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
      {/* Sidebar */}
      <aside
        id="loci-sidebar"
        style={{
          width: '220px',
          minWidth: '220px',
          background: 'var(--color-surface)',
          borderRight: '1px solid var(--color-border)',
          display: 'flex',
          flexDirection: 'column',
          padding: '16px 0',
          gap: '4px',
        }}
      >
        {/* Logo */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '0 16px 12px',
            borderBottom: '1px solid var(--color-border)',
            marginBottom: '8px',
          }}
        >
          <img src="/favicon.svg" alt="Loci Logo" className="w-8 h-8" style={{ width: '32px', height: '32px', borderRadius: '4px' }} />
          <span style={{ fontWeight: '700', fontSize: '18px', color: 'var(--color-text)' }}>
            Loci
          </span>
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
                padding: '12px 16px 4px',
                fontSize: '11px',
                fontWeight: '600',
                color: 'var(--color-text-muted)',
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
              border: '1px dashed var(--color-border)',
              background: 'transparent',
              color: 'var(--color-text-muted)',
              fontSize: '13px',
              cursor: 'pointer',
              transition: 'all var(--transition-fast)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-primary)'
              e.currentTarget.style.color = 'var(--color-primary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--color-border)'
              e.currentTarget.style.color = 'var(--color-text-muted)'
            }}
          >
            <Plus size={13} />
            New Project
          </button>
        </div>
      </aside>

      {/* Main content */}
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
        fontWeight: active ? '600' : '400',
        color: active ? 'var(--color-primary)' : 'var(--color-text)',
        background: active ? '#CCFBF1' : 'transparent',
        transition: 'background var(--transition-fast)',
      }}
      onMouseEnter={(e) => {
        if (!active) e.currentTarget.style.background = '#F0FDFA'
      }}
      onMouseLeave={(e) => {
        if (!active) e.currentTarget.style.background = 'transparent'
      }}
    >
      <span style={{ color: active ? 'var(--color-primary)' : 'var(--color-text-muted)', flexShrink: 0 }}>
        {icon}
      </span>
      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {label}
      </span>
      {badge && (
        <span
          style={{
            fontSize: '10px',
            fontWeight: '600',
            padding: '1px 5px',
            borderRadius: '4px',
            background: active ? 'var(--color-primary)' : 'var(--color-border)',
            color: active ? '#fff' : 'var(--color-text-muted)',
          }}
        >
          {badge}
        </span>
      )}
    </Link>
  )
}
