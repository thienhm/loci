import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import {
  Loader2,
  AlertCircle,
  Check,
  Pencil,
  Trash2,
  Upload,
  Download,
  File as FileIcon,
  X,
  Eye,
  Edit2,
  Save,
  Archive,
  ArchiveRestore,
  ChevronRight,
  Paperclip,
  Copy,
} from 'lucide-react'
import {
  fetchTicket,
  fetchDoc,
  writeDoc,
  uploadFile,
  listFiles,
  getFileUrl,
  deleteFile,
  updateTicket,
} from '../api/client'
import type { UploadedFile } from '../api/client'
import type { TicketStatus, TicketPriority, TicketWithDocs, TicketUpdateInput } from '../types'

// ─────────────────────────────────────────────────────────────────────────────
// Tab ordering
// ─────────────────────────────────────────────────────────────────────────────

const FIXED_DOC_ORDER = ['description.md', 'design.md', 'plan.md', 'summary.md']

function sortDocs(filenames: string[]): string[] {
  const fixed = FIXED_DOC_ORDER.filter((f) => filenames.includes(f))
  const others = filenames
    .filter((f) => !FIXED_DOC_ORDER.includes(f))
    .sort()
  return [...fixed, ...others]
}

function tabLabel(filename: string): string {
  return filename
    .replace(/\.md$/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────

export function TicketDetailPage() {
  const { projectId, ticketId } = useParams<{ projectId: string; ticketId: string }>()
  const queryClient = useQueryClient()

  const {
    data: ticket,
    isLoading,
    error,
  } = useQuery<TicketWithDocs>({
    queryKey: ['ticket', projectId, ticketId],
    queryFn: () => fetchTicket(projectId!, ticketId!),
    enabled: !!projectId && !!ticketId,
  })

  // For project name in breadcrumb
  const { data: project } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      const res = await fetch(`/api/projects/${projectId}`)
      if (!res.ok) return null
      return res.json()
    },
    enabled: !!projectId,
  })

  // Active tab: doc filename
  const docFilenames = ticket ? sortDocs(Object.keys(ticket.docs)) : []
  const [activeTab, setActiveTab] = useState<string>('description.md')

  // Keep active tab in sync when ticket loads
  useEffect(() => {
    if (ticket && !ticket.docs[activeTab]) {
      const first = sortDocs(Object.keys(ticket.docs))[0] ?? 'description.md'
      setActiveTab(first)
    }
  }, [ticket, activeTab])

  const patchMutation = useMutation({
    mutationFn: (fields: TicketUpdateInput) =>
      updateTicket(projectId!, ticketId!, fields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', projectId, ticketId] })
      queryClient.invalidateQueries({ queryKey: ['tickets', projectId] })
    },
  })

  // ── WAI-ARIA keyboard navigation ──────────────────────────────────────────
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  function handleTabKeyDown(e: React.KeyboardEvent, index: number) {
    let next = index
    if (e.key === 'ArrowRight') next = (index + 1) % docFilenames.length
    else if (e.key === 'ArrowLeft') next = (index - 1 + docFilenames.length) % docFilenames.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = docFilenames.length - 1
    else return
    e.preventDefault()
    setActiveTab(docFilenames[next])
    tabRefs.current[next]?.focus()
  }

  if (isLoading) {
    return (
      <div style={styles.center}>
        <Loader2 size={22} style={{ color: 'var(--color-primary)', animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  if (error || !ticket) {
    return (
      <div style={styles.center}>
        <AlertCircle size={22} style={{ color: 'var(--color-error)' }} />
        <span style={{ color: 'var(--color-error)', marginTop: '8px' }}>
          Ticket not found
        </span>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      {/* Breadcrumb navigation */}
      <nav style={styles.breadcrumb}>
        <Link to="/" style={styles.breadcrumbLink}>Projects</Link>
        <ChevronRight size={14} color="var(--color-outline)" />
        <Link to={`/project/${projectId}`} style={styles.breadcrumbLink}>
          {project?.name ?? projectId}
        </Link>
        <ChevronRight size={14} color="var(--color-outline)" />
        <span style={styles.breadcrumbCurrent}>{ticketId}</span>
        <CopyButton text={`${ticketId} - ${ticket.title}`} />
      </nav>

      {/* Two-column layout */}
      <div style={styles.twoColumn}>
        {/* Left column: Title + Tabs + Attachments */}
        <div style={styles.leftColumn}>
          {/* Archived banner */}
          {ticket.archived && (
            <div style={styles.archivedBanner}>
              <Archive size={14} />
              This ticket is archived
              <button
                onClick={() => patchMutation.mutate({ archived: false })}
                style={styles.unarchiveBtn}
              >
                <ArchiveRestore size={12} />
                Unarchive
              </button>
            </div>
          )}

          {/* Ticket header card */}
          <div style={{ marginBottom: '16px' }}>
            <TicketHeader ticket={ticket} onPatch={(fields) => patchMutation.mutate(fields)} />
          </div>

          {/* Markdown tabs + viewer */}
          <div style={{ ...styles.docCard, marginBottom: '16px' }}>
            {/* Tab bar */}
            <div role="tablist" aria-label="Ticket sections" style={styles.tabBar}>
              {docFilenames.map((filename, i) => (
                <button
                  key={filename}
                  id={`tab-${filename}`}
                  role="tab"
                  aria-selected={activeTab === filename}
                  tabIndex={activeTab === filename ? 0 : -1}
                  ref={(el) => { tabRefs.current[i] = el }}
                  onClick={() => setActiveTab(filename)}
                  onKeyDown={(e) => handleTabKeyDown(e, i)}
                  style={{
                    ...styles.tab,
                    ...(activeTab === filename ? styles.tabActive : {}),
                  }}
                >
                  {tabLabel(filename)}
                </button>
              ))}
            </div>

            {/* Doc content */}
            <DocTab
              projectId={projectId!}
              ticketId={ticketId!}
              filename={activeTab}
              initialContent={ticket.docs[activeTab] ?? ''}
            />
          </div>

          {/* Attachments section */}
          <AttachmentsSection projectId={projectId!} ticketId={ticketId!} />
        </div>

        {/* Right column: Properties panel */}
        <PropertiesPanel
          ticket={ticket}
          onPatch={(fields) => patchMutation.mutate(fields)}
        />
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Ticket header card
// ─────────────────────────────────────────────────────────────────────────────

function TicketHeader({
  ticket,
  onPatch,
}: {
  ticket: TicketWithDocs
  onPatch: (fields: TicketUpdateInput) => void
}) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState(ticket.title)

  function saveTitle() {
    if (titleDraft.trim() && titleDraft.trim() !== ticket.title) {
      onPatch({ title: titleDraft.trim() })
    }
    setEditingTitle(false)
  }

  return (
    <div style={styles.headerCard}>

      {/* Title */}
      {editingTitle ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <input
            id="ticket-title-input"
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveTitle()
              if (e.key === 'Escape') { setTitleDraft(ticket.title); setEditingTitle(false) }
            }}
            style={styles.titleInput}
          />
          <button id="save-title-btn" onClick={saveTitle} style={styles.iconBtn}>
            <Check size={14} color="var(--color-primary)" />
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '8px' }}>
          <h1 id="ticket-title" style={styles.title}>{ticket.title}</h1>
          <button
            id="edit-title-btn"
            onClick={() => { setTitleDraft(ticket.title); setEditingTitle(true) }}
            style={{ ...styles.iconBtn, marginTop: '4px' }}
          >
            <Pencil size={13} color="var(--color-on-surface-variant)" />
          </button>
        </div>
      )}


    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Properties panel (right sidebar)
// ─────────────────────────────────────────────────────────────────────────────

function PropertiesPanel({
  ticket,
  onPatch,
}: {
  ticket: TicketWithDocs
  onPatch: (fields: TicketUpdateInput) => void
}) {
  const [editingAssignee, setEditingAssignee] = useState(false)
  const [assigneeDraft, setAssigneeDraft] = useState(ticket.assignee ?? '')
  const escapingAssignee = useRef(false)
  const [editingLabels, setEditingLabels] = useState(false)
  const [labelsDraft, setLabelsDraft] = useState(ticket.labels.join(', '))
  const escapingLabels = useRef(false)
  const [progressDraft, setProgressDraft] = useState(ticket.progress)

  function saveAssignee() {
    if (escapingAssignee.current) { escapingAssignee.current = false; return }
    const val = assigneeDraft.trim() || null
    if (val !== ticket.assignee) onPatch({ assignee: val })
    setEditingAssignee(false)
  }

  function saveLabels() {
    if (escapingLabels.current) { escapingLabels.current = false; return }
    const parsed = labelsDraft.split(',').map((l) => l.trim()).filter(Boolean)
    const changed = parsed.length !== ticket.labels.length || parsed.some((l, i) => l !== ticket.labels[i])
    if (changed) onPatch({ labels: parsed })
    setEditingLabels(false)
  }

  return (
    <aside style={styles.propertiesPanel}>
      <div style={styles.propertiesCard}>
        <h3 style={styles.propertiesTitle}>PROPERTIES</h3>

        {/* Status */}
        <div style={styles.propGroup}>
          <label style={styles.propLabel}>STATUS</label>
          <select
            id="ticket-status-select"
            value={ticket.status}
            onChange={(e) => onPatch({ status: e.target.value as TicketStatus })}
            style={styles.propSelect}
          >
            <option value="todo">Todo</option>
            <option value="in_progress">In Progress</option>
            <option value="in_review">In Review</option>
            <option value="done">Done</option>
          </select>
        </div>

        {/* Priority */}
        <div style={styles.propGroup}>
          <label style={styles.propLabel}>PRIORITY</label>
          <select
            id="ticket-priority-select"
            value={ticket.priority}
            onChange={(e) => onPatch({ priority: e.target.value as TicketPriority })}
            style={styles.propSelect}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        {/* Assignee */}
        <div style={styles.propGroup}>
          <label style={styles.propLabel}>ASSIGNEE</label>
          {editingAssignee ? (
            <input
              id="ticket-assignee-input"
              autoFocus
              value={assigneeDraft}
              placeholder="e.g. agent:claude"
              onChange={(e) => setAssigneeDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveAssignee()
                if (e.key === 'Escape') { escapingAssignee.current = true; setEditingAssignee(false) }
              }}
              onBlur={saveAssignee}
              style={styles.propInput}
            />
          ) : (
            <button
              id="ticket-assignee-btn"
              onClick={() => { setAssigneeDraft(ticket.assignee ?? ''); setEditingAssignee(true) }}
              style={styles.propClickable}
            >
              {ticket.assignee ?? <span style={{ color: 'var(--color-on-surface-variant)' }}>Unassigned</span>}
            </button>
          )}
        </div>

        {/* Progress */}
        <div style={styles.propGroup}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={styles.propLabel}>PROGRESS</label>
            <span style={{ fontSize: '13px', fontWeight: '700', color: 'var(--color-primary)' }}>{progressDraft}%</span>
          </div>
          <input
            id="ticket-progress-slider"
            type="range"
            min={0}
            max={100}
            value={progressDraft}
            onChange={(e) => setProgressDraft(Number(e.target.value))}
            onMouseUp={(e) => onPatch({ progress: Number((e.target as HTMLInputElement).value) })}
            onTouchEnd={(e) => onPatch({ progress: Number((e.target as HTMLInputElement).value) })}
            style={{ width: '100%', accentColor: 'var(--color-primary)', margin: '4px 0 0' }}
          />
        </div>

        {/* Labels */}
        <div style={styles.propGroup}>
          <label style={styles.propLabel}>LABELS</label>
          {editingLabels ? (
            <input
              id="ticket-labels-input"
              autoFocus
              value={labelsDraft}
              placeholder="comma-separated"
              onChange={(e) => setLabelsDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveLabels()
                if (e.key === 'Escape') { escapingLabels.current = true; setEditingLabels(false) }
              }}
              onBlur={saveLabels}
              style={styles.propInput}
            />
          ) : (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
              {ticket.labels.length > 0
                ? ticket.labels.map((l) => (
                    <span key={l} style={styles.labelChip}>{l}</span>
                  ))
                : <span style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)' }}>No labels</span>
              }
              <button
                id="edit-labels-btn"
                onClick={() => { setLabelsDraft(ticket.labels.join(', ')); setEditingLabels(true) }}
                style={styles.iconBtn}
              >
                <Pencil size={11} color="var(--color-on-surface-variant)" />
              </button>
            </div>
          )}
        </div>

        {/* Updated date */}
        <div style={styles.propGroup}>
          <label style={styles.propLabel}>UPDATED</label>
          <span style={{ fontSize: '12px', color: 'var(--color-on-surface-variant)' }}>
            {new Date(ticket.updatedAt).toLocaleDateString()}
          </span>
        </div>

        {/* Archive action */}
        {!ticket.archived && (
          <button
            id="archive-ticket-btn"
            onClick={() => onPatch({ archived: true })}
            style={styles.archiveBtn}
          >
            <Archive size={14} />
            Archive ticket
          </button>
        )}
      </div>
    </aside>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Document tab (viewer/editor)
// ─────────────────────────────────────────────────────────────────────────────

function DocTab({
  projectId,
  ticketId,
  filename,
  initialContent,
}: {
  projectId: string
  ticketId: string
  filename: string
  initialContent: string
}) {
  const queryClient = useQueryClient()
  const [mode, setMode] = useState<'view' | 'edit'>('view')
  const [draft, setDraft] = useState('')

  const { data: content = initialContent, isLoading } = useQuery<string>({
    queryKey: ['doc', projectId, ticketId, filename],
    queryFn: () => fetchDoc(projectId, ticketId, filename),
    initialData: initialContent,
    staleTime: 30_000,
  })

  const saveMutation = useMutation({
    mutationFn: (text: string) => writeDoc(projectId, ticketId, filename, text),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['doc', projectId, ticketId, filename] })
      queryClient.invalidateQueries({ queryKey: ['ticket', projectId, ticketId] })
      setMode('view')
    },
  })

  function enterEdit() {
    setDraft(content)
    setMode('edit')
  }

  if (isLoading) {
    return (
      <div style={styles.center}>
        <Loader2 size={16} style={{ color: 'var(--color-primary)', animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  return (
    <div style={styles.docContent}>
      {/* Toolbar */}
      <div style={styles.docToolbar}>
        {mode === 'view' ? (
          <button id={`edit-doc-btn-${filename}`} onClick={enterEdit} style={styles.toolbarBtn}>
            <Edit2 size={13} />
            Edit
          </button>
        ) : (
          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              id={`save-doc-btn-${filename}`}
              onClick={() => saveMutation.mutate(draft)}
              disabled={saveMutation.isPending}
              style={{ ...styles.toolbarBtn, ...styles.toolbarBtnPrimary }}
            >
              <Save size={13} />
              {saveMutation.isPending ? 'Saving…' : 'Save'}
            </button>
            <button
              id={`cancel-doc-btn-${filename}`}
              onClick={() => setMode('view')}
              style={styles.toolbarBtn}
            >
              Cancel
            </button>
          </div>
        )}
        {mode === 'view' && (
          <span style={styles.modeHint}>
            <Eye size={11} /> View
          </span>
        )}
      </div>

      {/* Content */}
      {mode === 'view' ? (
        content ? (
          <div id={`doc-view-${filename}`} style={styles.markdownBody} className="prose prose-sm loci-markdown">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>{content}</ReactMarkdown>
          </div>
        ) : (
          <div style={styles.emptyDoc}>
            <span>This doc is empty.</span>
            <button onClick={enterEdit} style={{ ...styles.toolbarBtn, marginTop: '8px' }}>
              <Edit2 size={13} /> Start editing
            </button>
          </div>
        )
      ) : (
        <textarea
          id={`doc-textarea-${filename}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          style={styles.docTextarea}
          placeholder={`Write ${filename} content here…`}
          autoFocus
        />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Attachments section (below doc viewer)
// ─────────────────────────────────────────────────────────────────────────────

function AttachmentsSection({
  projectId,
  ticketId,
}: {
  projectId: string
  ticketId: string
}) {
  const queryClient = useQueryClient()
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploading, setUploading] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null)

  const { data: files = [], isLoading } = useQuery<UploadedFile[]>({
    queryKey: ['files', projectId, ticketId],
    queryFn: () => listFiles(projectId, ticketId),
  })

  const deleteMutation = useMutation({
    mutationFn: (filename: string) => deleteFile(projectId, ticketId, filename),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['files', projectId, ticketId] }),
  })

  async function handleUpload(fileList: FileList | File[]) {
    const filesToUpload = Array.from(fileList)
    setUploading((prev) => [...prev, ...filesToUpload.map((f) => f.name)])

    for (const file of filesToUpload) {
      try {
        const result = await uploadFile(projectId, ticketId, file)
        if (result.type === 'doc' || result.savedAsDoc) {
          queryClient.invalidateQueries({ queryKey: ['ticket', projectId, ticketId] })
        }
      } catch {
        // Upload failed — silently skip
      }
    }

    setUploading([])
    queryClient.invalidateQueries({ queryKey: ['files', projectId, ticketId] })
  }

  function handleDragOver(e: React.DragEvent) { e.preventDefault(); setIsDragOver(true) }
  function handleDragLeave(e: React.DragEvent) { e.preventDefault(); setIsDragOver(false) }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setIsDragOver(false)
    if (e.dataTransfer.files.length > 0) handleUpload(e.dataTransfer.files)
  }
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      handleUpload(e.target.files)
      e.target.value = ''
    }
  }
  function isPreviewable(name: string): boolean { return /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(name) }
  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (isLoading) return null

  return (
    <div style={styles.attachmentsCard}>
      <h3 style={styles.attachmentsTitle}>
        <Paperclip size={16} color="var(--color-primary)" />
        Attachments ({files.length})
      </h3>

      <input ref={fileInputRef} type="file" multiple onChange={handleFileSelect} style={{ display: 'none' }} />

      {/* File grid + upload card */}
      <div style={styles.fileGrid}>
        {files.map((file) => (
          <div
            key={file.name}
            style={styles.fileCard}
            onClick={() => setPreviewFile(file)}
          >
            {isPreviewable(file.name) ? (
              <div style={styles.filePreview}>
                <img
                  src={getFileUrl(projectId, ticketId, file.name)}
                  alt={file.name}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'cover', borderRadius: '6px' }}
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              </div>
            ) : (
              <div style={{ ...styles.filePreview, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <FileIcon size={28} color="var(--color-on-surface-variant)" />
              </div>
            )}
            <div style={styles.fileInfo}>
              <span style={styles.fileName} title={file.name}>{file.name}</span>
              <span style={styles.fileSize}>{formatSize(file.size)}</span>
            </div>
            <div style={styles.fileActions}>
              <a
                href={getFileUrl(projectId, ticketId, file.name)}
                download={file.name}
                title="Download"
                style={styles.iconBtn}
                onClick={(e) => e.stopPropagation()}
              >
                <Download size={13} color="var(--color-on-surface-variant)" />
              </a>
              <button
                onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(file.name) }}
                disabled={deleteMutation.isPending}
                title="Delete"
                style={styles.iconBtn}
              >
                <Trash2 size={13} color="#ba1a1a" />
              </button>
            </div>
          </div>
        ))}

        {/* Upload card */}
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            ...styles.uploadCard,
            borderColor: isDragOver ? 'var(--color-primary)' : 'rgba(188, 201, 198, 0.4)',
            background: isDragOver ? 'rgba(0, 104, 95, 0.04)' : 'transparent',
          }}
        >
          <Upload size={20} color={isDragOver ? 'var(--color-primary)' : 'var(--color-on-surface-variant)'} />
          <span style={{ fontSize: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-on-surface-variant)' }}>
            Upload
          </span>
        </div>
      </div>

      {uploading.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--color-on-surface-variant)', marginTop: '8px' }}>
          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
          Uploading {uploading.length} file{uploading.length > 1 ? 's' : ''}…
        </div>
      )}

      {/* Preview modal */}
      {previewFile && (
        <div style={styles.modalOverlay} onClick={() => setPreviewFile(null)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--color-on-surface)' }}>
                {previewFile.name}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: 'var(--color-on-surface-variant)' }}>
                  {formatSize(previewFile.size)}
                </span>
                <button onClick={() => setPreviewFile(null)} style={styles.iconBtn}>
                  <X size={16} color="var(--color-on-surface-variant)" />
                </button>
              </div>
            </div>

            <div style={styles.modalBody}>
              {isPreviewable(previewFile.name) ? (
                <img
                  src={getFileUrl(projectId, ticketId, previewFile.name)}
                  alt={previewFile.name}
                  style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: '4px' }}
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '40px' }}>
                  <FileIcon size={48} color="var(--color-on-surface-variant)" />
                  <span style={{ fontSize: '13px', color: 'var(--color-on-surface-variant)' }}>
                    No preview available for this file type
                  </span>
                </div>
              )}
            </div>

            <div style={styles.modalFooter}>
              <a
                href={getFileUrl(projectId, ticketId, previewFile.name)}
                download={previewFile.name}
                style={{ ...styles.toolbarBtn, ...styles.toolbarBtnPrimary, textDecoration: 'none' }}
              >
                <Download size={13} />
                Download
              </a>
              <button
                onClick={() => { deleteMutation.mutate(previewFile.name); setPreviewFile(null) }}
                style={{ ...styles.toolbarBtn, color: '#ba1a1a', borderColor: '#ba1a1a' }}
              >
                <Trash2 size={13} />
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Copy button (for breadcrumb)
// ─────────────────────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // Fallback: ignore if clipboard API unavailable
    }
  }

  return (
    <button
      onClick={handleCopy}
      title={`Copy "${text}"`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        background: copied ? 'rgba(0, 104, 95, 0.08)' : 'transparent',
        cursor: 'pointer',
        padding: '4px',
        borderRadius: '4px',
        marginLeft: '4px',
        transition: 'background 150ms ease',
      }}
    >
      {copied ? (
        <Check size={14} color="var(--color-primary)" />
      ) : (
        <Copy size={14} color="var(--color-on-surface-variant)" />
      )}
    </button>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const styles = {
  page: {
    padding: '0 32px 32px',
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    background: 'var(--color-surface-container-low)',
  },
  center: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: '8px',
  },

  // Breadcrumb
  breadcrumb: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '16px 0',
    fontSize: '13px',
    flexShrink: 0,
  },
  breadcrumbLink: {
    color: 'var(--color-on-surface-variant)',
    textDecoration: 'none',
    fontWeight: '500' as const,
    transition: 'color 150ms ease',
  },
  breadcrumbCurrent: {
    fontWeight: '600' as const,
    color: 'var(--color-primary)',
  },

  // Two-column layout
  twoColumn: {
    display: 'flex',
    gap: '24px',
    flex: 1,
    overflow: 'hidden',
    minHeight: 0,
  },
  leftColumn: {
    flex: 1,
    overflowY: 'auto' as const,
    minWidth: 0,
    // Children stack with gap via > * + * margin
  },

  // Archived banner
  archivedBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    background: '#FEF3C7',
    borderRadius: '8px',
    fontSize: '12px',
    fontWeight: '600' as const,
    color: '#92400E',
    flexShrink: 0,
  },
  unarchiveBtn: {
    marginLeft: 'auto',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '3px 10px',
    borderRadius: '4px',
    border: '1px solid #92400E',
    background: 'transparent',
    color: '#92400E',
    fontSize: '11px',
    fontWeight: '600' as const,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },

  // Header card
  headerCard: {
    background: 'var(--color-surface-container-lowest)',
    borderRadius: '12px',
    padding: '24px',
    flexShrink: 0,
  },
  headerLabel: {
    fontSize: '11px',
    fontWeight: '700' as const,
    padding: '3px 10px',
    borderRadius: '9999px',
    background: 'var(--color-secondary-container)',
    color: 'var(--color-on-secondary-container)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.03em',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: '800' as const,
    color: 'var(--color-on-surface)',
    margin: 0,
    lineHeight: 1.3,
    letterSpacing: '-0.02em',
  },
  titleInput: {
    flex: 1,
    fontSize: '1.5rem',
    fontWeight: '800' as const,
    color: 'var(--color-on-surface)',
    border: '2px solid var(--color-primary)',
    borderRadius: '8px',
    padding: '4px 12px',
    fontFamily: 'inherit',
    outline: 'none',
    background: 'transparent',
  },
  metaLine: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginTop: '12px',
  },

  // Doc card
  docCard: {
    background: 'var(--color-surface-container-lowest)',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column' as const,
    maxHeight: '1400px',
  },
  tabBar: {
    display: 'flex',
    gap: '0',
    borderBottom: '1px solid var(--color-surface-container)',
    paddingLeft: '16px',
    flexShrink: 0,
  },
  tab: {
    padding: '14px 24px',
    fontSize: '13px',
    fontWeight: '500' as const,
    color: 'var(--color-on-surface-variant)',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    marginBottom: '-1px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'color 150ms ease, border-color 150ms ease',
  },
  tabActive: {
    color: 'var(--color-primary)',
    fontWeight: '600' as const,
    borderBottomColor: 'var(--color-primary)',
  },
  docContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
  },
  docToolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    borderBottom: '1px solid var(--color-surface-container-high)',
    flexShrink: 0,
  },
  toolbarBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '5px 12px',
    fontSize: '12px',
    fontWeight: '600' as const,
    border: '1px solid rgba(188, 201, 198, 0.3)',
    borderRadius: '6px',
    background: 'transparent',
    color: 'var(--color-on-surface)',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  toolbarBtnPrimary: {
    background: 'var(--color-primary)',
    color: '#fff',
    border: '1px solid transparent',
  },
  modeHint: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    color: 'var(--color-on-surface-variant)',
  },
  markdownBody: {
    flex: 1,
    overflow: 'auto',
    padding: '24px',
    fontSize: '14px',
    lineHeight: 1.7,
    color: 'var(--color-on-surface)',
  },
  emptyDoc: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-on-surface-variant)',
    fontSize: '13px',
    gap: '4px',
    padding: '40px',
  },
  docTextarea: {
    flex: 1,
    resize: 'none' as const,
    border: 'none',
    outline: 'none',
    padding: '16px 24px',
    fontSize: '13px',
    lineHeight: 1.7,
    fontFamily: 'monospace',
    color: 'var(--color-on-surface)',
    background: 'var(--color-surface-container-low)',
    minHeight: '400px',
    width: '100%',
    boxSizing: 'border-box' as const,
  },

  // Attachments
  attachmentsCard: {
    background: 'var(--color-surface-container-lowest)',
    borderRadius: '12px',
    padding: '24px',
    flexShrink: 0,
  },
  attachmentsTitle: {
    fontSize: '13px',
    fontWeight: '700' as const,
    margin: '0 0 16px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    color: 'var(--color-on-surface)',
  },
  fileGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: '12px',
  },
  fileCard: {
    background: 'var(--color-surface-container-low)',
    borderRadius: '10px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
    cursor: 'pointer',
    transition: 'box-shadow 150ms ease',
  },
  filePreview: {
    height: '100px',
    overflow: 'hidden',
    background: 'var(--color-surface-container)',
    padding: '4px',
  },
  fileInfo: {
    padding: '6px 8px 2px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '1px',
  },
  fileName: {
    fontSize: '11px',
    fontWeight: '600' as const,
    color: 'var(--color-on-surface)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  fileSize: {
    fontSize: '10px',
    color: 'var(--color-on-surface-variant)',
  },
  fileActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '4px',
    padding: '2px 6px 6px',
  },
  uploadCard: {
    aspectRatio: '16/9',
    borderRadius: '10px',
    border: '2px dashed rgba(188, 201, 198, 0.4)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    cursor: 'pointer',
    transition: 'all 150ms ease',
  },

  // Properties panel
  propertiesPanel: {
    width: '280px',
    minWidth: '280px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    overflowY: 'auto' as const,
  },
  propertiesCard: {
    background: 'var(--color-surface-container-lowest)',
    borderRadius: '12px',
    padding: '24px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
  },
  propertiesTitle: {
    fontSize: '11px',
    fontWeight: '700' as const,
    letterSpacing: '0.08em',
    color: 'var(--color-on-surface-variant)',
    margin: '0 0 4px',
  },
  propGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  propLabel: {
    fontSize: '11px',
    fontWeight: '700' as const,
    color: 'var(--color-outline)',
    letterSpacing: '0.05em',
  },
  propSelect: {
    fontSize: '13px',
    fontWeight: '600' as const,
    padding: '8px 10px',
    border: 'none',
    borderRadius: '8px',
    background: 'var(--color-surface-container-low)',
    color: 'var(--color-on-surface)',
    fontFamily: 'inherit',
    outline: 'none',
    cursor: 'pointer',
  },
  propInput: {
    fontSize: '13px',
    padding: '8px 10px',
    border: 'none',
    borderRadius: '8px',
    background: 'var(--color-surface-container-low)',
    color: 'var(--color-on-surface)',
    fontFamily: 'inherit',
    outline: 'none',
  },
  propClickable: {
    fontSize: '13px',
    fontWeight: '600' as const,
    padding: '8px 10px',
    border: 'none',
    borderRadius: '8px',
    background: 'var(--color-surface-container-low)',
    color: 'var(--color-on-surface)',
    fontFamily: 'inherit',
    cursor: 'pointer',
    textAlign: 'left' as const,
  },
  progressTrack: {
    height: '6px',
    width: '100%',
    background: 'var(--color-surface-container-high)',
    borderRadius: '9999px',
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    background: 'var(--color-primary)',
    borderRadius: '9999px',
    transition: 'width 200ms ease',
  },
  labelChip: {
    fontSize: '10px',
    fontWeight: '700' as const,
    padding: '3px 8px',
    borderRadius: '4px',
    background: 'var(--color-secondary-container)',
    color: 'var(--color-on-secondary-container)',
  },
  archiveBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '8px 12px',
    fontSize: '12px',
    fontWeight: '600' as const,
    color: 'var(--color-on-surface-variant)',
    background: 'transparent',
    border: '1px solid rgba(188, 201, 198, 0.3)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginTop: '8px',
  },
  iconBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    lineHeight: 1,
    transition: 'background 100ms ease',
  },

  // Modal
  modalOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(25, 28, 30, 0.4)',
    backdropFilter: 'blur(4px)',
    WebkitBackdropFilter: 'blur(4px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    background: 'var(--color-surface-container-lowest)',
    borderRadius: '14px',
    border: '1px solid rgba(188, 201, 198, 0.15)',
    maxWidth: '80vw',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    boxShadow: '0 4px 20px rgba(25, 28, 30, 0.06)',
    minWidth: '320px',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid var(--color-surface-container-high)',
    flexShrink: 0,
  },
  modalBody: {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    background: 'var(--color-surface-container-low)',
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    padding: '12px 16px',
    borderTop: '1px solid var(--color-surface-container-high)',
    flexShrink: 0,
  },
}
