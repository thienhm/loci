import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from '../App'

// Mock the API client so tests don't hit the network
vi.mock('../api/client', () => ({
  fetchProjects: vi.fn().mockResolvedValue([]),
  fetchTickets: vi.fn().mockResolvedValue([]),
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
  it('renders without crashing', () => {
    const Wrapper = makeWrapper()
    render(
      <Wrapper>
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </Wrapper>
    )
    // App shell and main content should be present
    expect(document.getElementById('loci-sidebar')).toBeInTheDocument()
    expect(document.getElementById('loci-main')).toBeInTheDocument()
  })

  it('dashboard route mounts at /', () => {
    const Wrapper = makeWrapper()
    render(
      <Wrapper>
        <MemoryRouter initialEntries={['/']}>
          <App />
        </MemoryRouter>
      </Wrapper>
    )
    // Dashboard page renders the "All Projects" heading
    expect(screen.getByRole('heading', { name: /all projects/i })).toBeInTheDocument()
  })

  it('project board route mounts at /project/:id', () => {
    const Wrapper = makeWrapper()
    render(
      <Wrapper>
        <MemoryRouter initialEntries={['/project/test-project-id']}>
          <App />
        </MemoryRouter>
      </Wrapper>
    )
    // ProjectBoardPage renders
    expect(screen.getByRole('heading', { name: /project board/i })).toBeInTheDocument()
  })

  it('unknown routes redirect to dashboard', () => {
    const Wrapper = makeWrapper()
    render(
      <Wrapper>
        <MemoryRouter initialEntries={['/does-not-exist']}>
          <App />
        </MemoryRouter>
      </Wrapper>
    )
    // Should redirect to dashboard
    expect(screen.getByRole('heading', { name: /all projects/i })).toBeInTheDocument()
  })
})
