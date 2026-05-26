import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DashboardPage } from '../pages/DashboardPage'

vi.mock('../api/client', () => ({
  fetchProjects: vi.fn().mockResolvedValue([
    {
      id: 'healthy-project',
      name: 'Healthy Project',
      prefix: 'HP',
      path: '/tmp/healthy-project',
      lociVersion: '1.1.0',
      lastSeenAt: '2026-05-26T00:00:00Z',
      lastIndexedAt: null,
      healthStatus: 'healthy',
      available: true,
      openTicketCount: 4,
      reviewTicketCount: 2,
      validationFailureCount: 1,
      ticketStatusCounts: {
        idea: 1,
        shaped: 1,
        ready: 1,
        in_progress: 1,
        in_review: 2,
        done: 3,
      },
    },
    {
      id: 'missing-project',
      name: 'Missing Project',
      prefix: 'MP',
      path: '/tmp/missing-project',
      lociVersion: '1.1.0',
      lastSeenAt: '2026-05-26T00:00:00Z',
      lastIndexedAt: null,
      healthStatus: 'missing',
      available: false,
      unavailableReason: 'Missing project database: /tmp/missing-project/.loci/loci.db',
      openTicketCount: 0,
      reviewTicketCount: 0,
      validationFailureCount: 0,
      ticketStatusCounts: {
        idea: 0,
        shaped: 0,
        ready: 0,
        in_progress: 0,
        in_review: 0,
        done: 0,
      },
    },
  ]),
  fetchTickets: vi.fn().mockResolvedValue([]),
}))

function renderDashboard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('DashboardPage', () => {
  it('shows global project health and workflow totals', async () => {
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /active projects/i })).toBeInTheDocument()
    })

    expect(screen.getByText('4 open')).toBeInTheDocument()
    expect(screen.getByText('2 in review')).toBeInTheDocument()
    expect(screen.getByText('1 validation failing')).toBeInTheDocument()
    expect(screen.getByText('Healthy')).toBeInTheDocument()
  })

  it('keeps unavailable projects visible with a missing health state', async () => {
    renderDashboard()

    await waitFor(() => {
      expect(screen.getByText('Missing Project')).toBeInTheDocument()
    })

    expect(screen.getByText('Missing')).toBeInTheDocument()
    expect(screen.getByText('/tmp/missing-project')).toBeInTheDocument()
    expect(screen.getByText(/missing project database/i)).toBeInTheDocument()
  })
})
