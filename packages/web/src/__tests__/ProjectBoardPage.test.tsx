import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ProjectBoardPage } from '../pages/ProjectBoardPage'

vi.mock('../api/client', () => ({
  fetchProject: vi.fn().mockResolvedValue({
    id: 'test-id',
    name: 'Lifecycle Project',
    prefix: 'LIF',
  }),
  fetchTickets: vi.fn().mockResolvedValue([
    {
      id: 'LIF-001',
      title: 'Capture intent',
      status: 'idea',
      priority: 'medium',
      labels: [],
      assignee: null,
      progress: 0,
      archived: false,
      createdAt: '2026-05-26T00:00:00Z',
      updatedAt: '2026-05-26T00:00:00Z',
    },
    {
      id: 'LIF-002',
      title: 'Shape scope',
      status: 'shaped',
      priority: 'medium',
      labels: [],
      assignee: null,
      progress: 0,
      archived: false,
      createdAt: '2026-05-26T01:00:00Z',
      updatedAt: '2026-05-26T01:00:00Z',
    },
    {
      id: 'LIF-003',
      title: 'Ready to build',
      status: 'ready',
      priority: 'high',
      labels: [],
      assignee: null,
      progress: 0,
      archived: false,
      createdAt: '2026-05-26T02:00:00Z',
      updatedAt: '2026-05-26T02:00:00Z',
    },
  ]),
  createTicket: vi.fn(),
  updateTicket: vi.fn(),
}))

vi.mock('../hooks/useSSE', () => ({
  useSSE: vi.fn(),
}))

function renderBoard() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/project/test-id']}>
        <Routes>
          <Route path="/project/:projectId" element={<ProjectBoardPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

describe('ProjectBoardPage lifecycle columns', () => {
  it('renders Rust lifecycle tickets in idea, shaped, and ready columns', async () => {
    renderBoard()

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /lifecycle project/i })).toBeInTheDocument()
    })

    expect(screen.getByText('Idea')).toBeInTheDocument()
    expect(screen.getByText('Shaped')).toBeInTheDocument()
    expect(screen.getByText('Ready')).toBeInTheDocument()
    expect(screen.getByText('Capture intent')).toBeInTheDocument()
    expect(screen.getByText('Shape scope')).toBeInTheDocument()
    expect(screen.getByText('Ready to build')).toBeInTheDocument()
  })
})
