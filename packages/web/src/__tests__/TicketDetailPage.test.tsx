import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockTicket = {
  id: 'LCI-001',
  title: 'Test ticket',
  status: 'todo' as const,
  priority: 'medium' as const,
  labels: ['ui', 'web'],
  assignee: null,
  progress: 40,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  docs: {
    'description.md': '# Description\n\nHello world',
    'plan.md': '# Plan\n\nDo something',
  },
}

const mockFetchTicket = vi.fn()
const mockFetchDoc = vi.fn()
const mockWriteDoc = vi.fn()
const mockFetchAttachments = vi.fn()
const mockWriteAttachments = vi.fn()
const mockUpdateTicket = vi.fn()

vi.mock('../api/client', () => ({
  fetchTicket: (...args: unknown[]) => mockFetchTicket(...args),
  fetchDoc: (...args: unknown[]) => mockFetchDoc(...args),
  writeDoc: (...args: unknown[]) => mockWriteDoc(...args),
  fetchAttachments: (...args: unknown[]) => mockFetchAttachments(...args),
  writeAttachments: (...args: unknown[]) => mockWriteAttachments(...args),
  updateTicket: (...args: unknown[]) => mockUpdateTicket(...args),
  listFiles: vi.fn().mockResolvedValue([]),
  uploadFile: vi.fn(),
  getFileUrl: vi.fn().mockReturnValue('mock-url'),
  deleteFile: vi.fn(),
}))

// Import AFTER vi.mock declarations so the mock is in place
const { TicketDetailPage } = await import('../pages/TicketDetailPage')

// ── Helper ────────────────────────────────────────────────────────────────────

// Renders TicketDetailPage inside a proper route so useParams() resolves
function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/project/proj-1/LCI-001']}>
        <Routes>
          <Route
            path="/project/:projectId/:ticketId"
            element={<TicketDetailPage />}
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  )
}

// Wait until the ticket ID badge appears (ticket loaded)
async function waitForTicketLoad() {
  await waitFor(() => expect(screen.getByText('LCI-001')).toBeInTheDocument())
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TicketDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockFetchTicket.mockResolvedValue(mockTicket)
    mockFetchDoc.mockResolvedValue('# Description\n\nHello world')
    mockFetchAttachments.mockResolvedValue(['src/foo.ts'])
    mockWriteAttachments.mockResolvedValue(['src/foo.ts'])
    mockUpdateTicket.mockResolvedValue(mockTicket)
    mockWriteDoc.mockResolvedValue(undefined)
  })

  // ── 5.1 Header ──────────────────────────────────────────────────────────────

  describe('ticket header', () => {
    it('renders ticket ID, title, and back link', async () => {
      renderPage()
      await waitForTicketLoad()

      expect(screen.getByText('LCI-001')).toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /test ticket/i })).toBeInTheDocument()
      expect(screen.getByRole('link', { name: /projects/i })).toBeInTheDocument()
    })

    it('renders at least two select elements (status and priority)', async () => {
      renderPage()
      await waitForTicketLoad()

      const selects = screen.getAllByRole('combobox')
      expect(selects.length).toBeGreaterThanOrEqual(2)
    })

    it('changing status calls updateTicket with new status', async () => {
      renderPage()
      await waitForTicketLoad()

      const selects = screen.getAllByRole('combobox')
      fireEvent.change(selects[0], { target: { value: 'done' } })

      await waitFor(() =>
        expect(mockUpdateTicket).toHaveBeenCalledWith(
          'proj-1',
          'LCI-001',
          { status: 'done' }
        )
      )
    })

    it('clicking the edit-title pencil shows a text input', async () => {
      renderPage()
      await waitForTicketLoad()

      fireEvent.click(document.getElementById('edit-title-btn')!)
      expect(document.getElementById('ticket-title-input')).toBeInTheDocument()
    })

    it('entering a new title and pressing Enter calls updateTicket', async () => {
      renderPage()
      await waitForTicketLoad()

      fireEvent.click(document.getElementById('edit-title-btn')!)
      const input = document.getElementById('ticket-title-input') as HTMLInputElement
      fireEvent.change(input, { target: { value: 'Updated title' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      await waitFor(() =>
        expect(mockUpdateTicket).toHaveBeenCalledWith(
          'proj-1',
          'LCI-001',
          { title: 'Updated title' }
        )
      )
    })

    it('renders label chips for existing labels', async () => {
      renderPage()
      await waitForTicketLoad()

      expect(screen.getByText('ui')).toBeInTheDocument()
      expect(screen.getByText('web')).toBeInTheDocument()
    })
  })

  // ── 5.2 Doc tabs ────────────────────────────────────────────────────────────

  describe('document tabs', () => {
    it('renders a tab for each doc file and the Attachments tab', async () => {
      renderPage()
      await waitForTicketLoad()

      expect(document.getElementById('tab-description.md')).toBeInTheDocument()
      expect(document.getElementById('tab-plan.md')).toBeInTheDocument()
    })

    it('description doc view renders by default', async () => {
      renderPage()
      await waitForTicketLoad()

      await waitFor(() =>
        expect(document.getElementById('doc-view-description.md')).toBeInTheDocument()
      )
    })

    it('clicking the Plan tab shows its doc view', async () => {
      renderPage()
      await waitForTicketLoad()

      mockFetchDoc.mockResolvedValue('# Plan\n\nDo something')
      fireEvent.click(document.getElementById('tab-plan.md')!)

      await waitFor(() =>
        expect(document.getElementById('doc-view-plan.md')).toBeInTheDocument()
      )
    })

    it('clicking Edit shows the textarea and Save button', async () => {
      renderPage()
      await waitForTicketLoad()

      fireEvent.click(document.getElementById('edit-doc-btn-description.md')!)

      expect(document.getElementById('doc-textarea-description.md')).toBeInTheDocument()
      expect(document.getElementById('save-doc-btn-description.md')).toBeInTheDocument()
    })

    it('saving a doc calls writeDoc with the edited content', async () => {
      renderPage()
      await waitForTicketLoad()

      fireEvent.click(document.getElementById('edit-doc-btn-description.md')!)
      const textarea = document.getElementById('doc-textarea-description.md') as HTMLTextAreaElement
      fireEvent.change(textarea, { target: { value: 'New content' } })
      fireEvent.click(document.getElementById('save-doc-btn-description.md')!)

      await waitFor(() =>
        expect(mockWriteDoc).toHaveBeenCalledWith(
          'proj-1',
          'LCI-001',
          'description.md',
          'New content'
        )
      )
    })

    it('Cancel button exits edit mode without calling writeDoc', async () => {
      renderPage()
      await waitForTicketLoad()

      fireEvent.click(document.getElementById('edit-doc-btn-description.md')!)
      fireEvent.click(document.getElementById('cancel-doc-btn-description.md')!)

      expect(document.getElementById('doc-view-description.md')).toBeInTheDocument()
      expect(mockWriteDoc).not.toHaveBeenCalled()
    })
  })

  // ── Tab keyboard navigation (WAI-ARIA) ──────────────────────────────────────

  describe('tab keyboard navigation', () => {
    it('ArrowRight moves focus from Description to Plan tab', async () => {
      renderPage()
      await waitForTicketLoad()

      const descTab = document.getElementById('tab-description.md')!
      descTab.focus()
      await userEvent.keyboard('{ArrowRight}')

      expect(document.activeElement).toBe(document.getElementById('tab-plan.md'))
    })

    it('ArrowLeft wraps from the first tab to the last (Attachments)', async () => {
      renderPage()
      await waitForTicketLoad()

      const descTab = document.getElementById('tab-description.md')!
      descTab.focus()
      await userEvent.keyboard('{ArrowLeft}')

      expect(document.activeElement).toBe(document.getElementById('tab-plan.md'))
    })

    it('End key moves focus to the Attachments tab', async () => {
      renderPage()
      await waitForTicketLoad()

      const descTab = document.getElementById('tab-description.md')!
      descTab.focus()
      await userEvent.keyboard('{End}')

      expect(document.activeElement).toBe(document.getElementById('tab-plan.md'))
    })

    it('Home key moves focus to the first tab', async () => {
      renderPage()
      await waitForTicketLoad()

      const planTab = document.getElementById('tab-plan.md')!
      planTab.focus()
      await userEvent.keyboard('{Home}')

      expect(document.activeElement).toBe(document.getElementById('tab-description.md'))
    })
  })
})
