import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from '../App'

// Mock the API client so tests don't hit the network
vi.mock('../api/client', () => ({
  fetchProjects: vi.fn().mockResolvedValue([]),
  fetchTickets: vi.fn().mockResolvedValue([]),
  fetchProject: vi.fn().mockResolvedValue({
    id: 'test-id',
    name: 'Test Project',
    prefix: 'TST',
    nextId: 1,
    createdAt: new Date().toISOString(),
  }),
  createTicket: vi.fn(),
  updateTicket: vi.fn(),
}))

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    )
  }
}

describe('App smoke tests', () => {
  it('renders without crashing — sidebar is present', () => {
    const Wrapper = makeWrapper()
    render(
      <Wrapper>
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </Wrapper>
    )
    expect(document.getElementById('loci-sidebar')).toBeInTheDocument()
    expect(document.getElementById('loci-main')).toBeInTheDocument()
  })

  it('dashboard route mounts at / — shows heading after data loads', async () => {
    const Wrapper = makeWrapper()
    render(
      <Wrapper>
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </Wrapper>
    )
    // Wait for the async query to resolve and heading to appear
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /all projects/i })).toBeInTheDocument()
    })
  })

  it('project board route mounts at /project/:id', async () => {
    const Wrapper = makeWrapper()
    render(
      <Wrapper>
        <MemoryRouter initialEntries={['/project/test-id']}>
          <App />
        </MemoryRouter>
      </Wrapper>
    )
    // Wait for project board heading
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /test project/i })).toBeInTheDocument()
    })
  })

  it('unknown routes redirect to dashboard', async () => {
    const Wrapper = makeWrapper()
    render(
      <Wrapper>
        <MemoryRouter initialEntries={['/does-not-exist']}>
          <App />
        </MemoryRouter>
      </Wrapper>
    )
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /all projects/i })).toBeInTheDocument()
    })
  })
})
