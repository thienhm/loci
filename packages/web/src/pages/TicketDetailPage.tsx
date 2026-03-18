import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import {
  ArrowLeft,
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

  // Active tab: doc filename or 'attachments'
  const docFilenames = ticket ? sortDocs(Object.keys(ticket.docs)) : []
  const [activeTab, setActiveTab] = useState<string>('description.md')

  // Keep active tab in sync when ticket loads
  useEffect(() => {
    if (ticket && !ticket.docs[activeTab] && activeTab !== 'attachments') {
      const first = sortDocs(Object.keys(ticket.docs))[0] ?? 'description.md'
      setActiveTab(first)
    }
  }, [ticket, activeTab])

  const patchMutation = useMutation({
    mutationFn: (fields: TicketUpdateInput) =>
      updateTicket(projectId!, ticketId!, fields),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ticket', projectId, ticketId] })
      // Also invalidate the board's ticket list so navigating back shows fresh data
      queryClient.invalidateQueries({ queryKey: ['tickets', projectId] })
    },
  })

  // ── WAI-ARIA keyboard navigation ──────────────────────────────────────────
  const allTabs = [...docFilenames, 'attachments']
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([])

  function handleTabKeyDown(e: React.KeyboardEvent, index: number) {
    let next = index
    if (e.key === 'ArrowRight') next = (index + 1) % allTabs.length
    else if (e.key === 'ArrowLeft') next = (index - 1 + allTabs.length) % allTabs.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = allTabs.length - 1
    else return
    e.preventDefault()
    setActiveTab(allTabs[next])
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
        <AlertCircle size={22} style={{ color: 'var(--color-priority-high)' }} />
        <span style={{ color: 'var(--color-priority-high)', marginTop: '8px' }}>
          Ticket not found
        </span>
      </div>
    )
  }

  return (
    <div style={styles.page}>
      {/* Back link */}
      <Link to={`/project/${projectId}`} style={styles.backLink}>
        <ArrowLeft size={14} />
        Back to board
      </Link>

      {/* Ticket header */}
      <TicketHeader ticket={ticket} onPatch={(fields: TicketUpdateInput) => patchMutation.mutate(fields)} />

      {/* Tabs — WAI-ARIA tablist pattern */}
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
        <button
          id="tab-attachments"
          role="tab"
          aria-selected={activeTab === 'attachments'}
          tabIndex={activeTab === 'attachments' ? 0 : -1}
          ref={(el) => { tabRefs.current[docFilenames.length] = el }}
          onClick={() => setActiveTab('attachments')}
          onKeyDown={(e) => handleTabKeyDown(e, docFilenames.length)}
          style={{
            ...styles.tab,
            ...(activeTab === 'attachments' ? styles.tabActive : {}),
          }}
        >
          Attachments
        </button>
      </div>

      {/* Tab content */}
      <div style={styles.tabContent}>
        {activeTab === 'attachments' ? (
          <AttachmentsTab projectId={projectId!} ticketId={ticketId!} />
        ) : (
          <DocTab
            projectId={projectId!}
            ticketId={ticketId!}
            filename={activeTab}
            initialContent={ticket.docs[activeTab] ?? ''}
          />
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Ticket header (5.1)
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
  const [editingAssignee, setEditingAssignee] = useState(false)
  const [assigneeDraft, setAssigneeDraft] = useState(ticket.assignee ?? '')
  // escapingAssignee prevents onBlur from firing a PATCH after Escape
  const escapingAssignee = useRef(false)
  const [editingLabels, setEditingLabels] = useState(false)
  const [labelsDraft, setLabelsDraft] = useState(ticket.labels.join(', '))
  const escapingLabels = useRef(false)
  // Controlled progress state so slider position updates on refetch
  const [progressDraft, setProgressDraft] = useState(ticket.progress)

  function saveTitle() {
    if (titleDraft.trim() && titleDraft.trim() !== ticket.title) {
      onPatch({ title: titleDraft.trim() })
    }
    setEditingTitle(false)
  }

  function saveAssignee() {
    if (escapingAssignee.current) { escapingAssignee.current = false; return }
    const val = assigneeDraft.trim() || null
    if (val !== ticket.assignee) {
      onPatch({ assignee: val })
    }
    setEditingAssignee(false)
  }

  function saveLabels() {
    if (escapingLabels.current) { escapingLabels.current = false; return }
    const parsed = labelsDraft
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean)
    // Dirty check — only patch if labels actually changed
    const changed =
      parsed.length !== ticket.labels.length ||
      parsed.some((l, i) => l !== ticket.labels[i])
    if (changed) onPatch({ labels: parsed })
    setEditingLabels(false)
  }

  return (
    <div style={styles.header}>
      {/* Archived banner */}
      {ticket.archived && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '8px 12px',
          background: '#FEF3C7',
          borderRadius: '6px',
          fontSize: '12px',
          fontWeight: '600',
          color: '#92400E',
        }}>
          <Archive size={14} />
          This ticket is archived
          <button
            onClick={() => onPatch({ archived: false })}
            style={{
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
              fontWeight: '600',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <ArchiveRestore size={12} />
            Unarchive
          </button>
        </div>
      )}

      {/* Title row */}
      <div style={styles.titleRow}>
        <span style={styles.ticketId}>{ticket.id}</span>
        {editingTitle ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
            <h1 id="ticket-title" style={styles.title}>{ticket.title}</h1>
            <button
              id="edit-title-btn"
              onClick={() => { setTitleDraft(ticket.title); setEditingTitle(true) }}
              style={styles.iconBtn}
            >
              <Pencil size={13} color="var(--color-text-muted)" />
            </button>
            {!ticket.archived && (
              <button
                id="archive-ticket-btn"
                onClick={() => onPatch({ archived: true })}
                title="Archive ticket"
                style={styles.iconBtn}
              >
                <Archive size={14} color="var(--color-text-muted)" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Meta row */}
      <div style={styles.metaRow}>
        {/* Status */}
        <div style={styles.metaItem}>
          <span style={styles.metaLabel}>Status</span>
          <select
            id="ticket-status-select"
            value={ticket.status}
            onChange={(e) => onPatch({ status: e.target.value as TicketStatus })}
            style={styles.select}
          >
            <option value="todo">Todo</option>
            <option value="in_progress">In Progress</option>
            <option value="in_review">In Review</option>
            <option value="done">Done</option>
          </select>
        </div>

        {/* Priority */}
        <div style={styles.metaItem}>
          <span style={styles.metaLabel}>Priority</span>
          <select
            id="ticket-priority-select"
            value={ticket.priority}
            onChange={(e) => onPatch({ priority: e.target.value as TicketPriority })}
            style={styles.select}
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </div>

        {/* Assignee */}
        <div style={styles.metaItem}>
          <span style={styles.metaLabel}>Assignee</span>
          {editingAssignee ? (
            <div style={{ display: 'flex', gap: '4px' }}>
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
                style={{ ...styles.select, width: '160px' }}
              />
            </div>
          ) : (
            <button
              id="ticket-assignee-btn"
              onClick={() => { setAssigneeDraft(ticket.assignee ?? ''); setEditingAssignee(true) }}
              style={{ ...styles.select, cursor: 'pointer', textAlign: 'left' }}
            >
              {ticket.assignee ?? <span style={{ color: 'var(--color-text-muted)' }}>Unassigned</span>}
            </button>
          )}
        </div>

        {/* Progress */}
        <div style={styles.metaItem}>
          <span style={styles.metaLabel}>Progress {progressDraft}%</span>
          <input
            id="ticket-progress-slider"
            type="range"
            min={0}
            max={100}
            value={progressDraft}
            onChange={(e) => setProgressDraft(Number(e.target.value))}
            onMouseUp={(e) => onPatch({ progress: Number((e.target as HTMLInputElement).value) })}
            onTouchEnd={(e) => onPatch({ progress: Number((e.target as HTMLInputElement).value) })}
            style={{ width: '120px', accentColor: 'var(--color-primary)' }}
          />
        </div>
      </div>

      {/* Labels */}
      <div style={styles.labelsRow}>
        <span style={styles.metaLabel}>Labels</span>
        {editingLabels ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
              style={{ ...styles.select, width: '260px' }}
            />
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            {ticket.labels.length > 0
              ? ticket.labels.map((l) => (
                  <span key={l} style={styles.labelChip}>{l}</span>
                ))
              : <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>No labels</span>
            }
            <button
              id="edit-labels-btn"
              onClick={() => { setLabelsDraft(ticket.labels.join(', ')); setEditingLabels(true) }}
              style={styles.iconBtn}
            >
              <Pencil size={11} color="var(--color-text-muted)" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Document tab (5.2)
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
    <div style={styles.docPane}>
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
// Attachments tab (5.3)
// ─────────────────────────────────────────────────────────────────────────────

function AttachmentsTab({
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

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files)
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      handleUpload(e.target.files)
      e.target.value = ''
    }
  }

  function isPreviewable(name: string): boolean {
    return /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(name)
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  if (isLoading) {
    return (
      <div style={styles.center}>
        <Loader2 size={16} style={{ color: 'var(--color-primary)', animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  return (
    <div style={styles.attachmentsPane}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        style={{ display: 'none' }}
      />

      {/* Drop zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          ...styles.dropZone,
          borderColor: isDragOver ? 'var(--color-primary)' : 'var(--color-border)',
          background: isDragOver ? '#F0FDFA' : 'var(--color-background)',
        }}
      >
        <Upload size={20} color={isDragOver ? 'var(--color-primary)' : 'var(--color-text-muted)'} />
        <span style={{ fontSize: '13px', color: isDragOver ? 'var(--color-primary)' : 'var(--color-text-muted)', fontWeight: '500' }}>
          Drop files here or click to browse
        </span>
        <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
          .md files will be saved as document tabs
        </span>
      </div>

      {/* Uploading indicators */}
      {uploading.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--color-text-muted)' }}>
          <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
          Uploading {uploading.length} file{uploading.length > 1 ? 's' : ''}…
        </div>
      )}

      {/* File grid */}
      {files.length === 0 && uploading.length === 0 ? (
        <div style={styles.emptyDoc}>No files attached yet.</div>
      ) : (
        <div style={styles.fileGrid}>
          {files.map((file) => (
            <div
              key={file.name}
              style={{ ...styles.fileCard, cursor: 'pointer' }}
              onClick={() => setPreviewFile(file)}
            >
              {/* Preview or icon */}
              {isPreviewable(file.name) ? (
                <div style={styles.filePreview}>
                  <img
                    src={getFileUrl(projectId, ticketId, file.name)}
                    alt={file.name}
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '4px' }}
                    onError={(e) => {
                      const target = e.currentTarget
                      target.style.display = 'none'
                      if (target.parentElement) {
                        target.parentElement.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%"><span style="color:var(--color-text-muted);font-size:11px">Preview failed</span></div>'
                      }
                    }}
                  />
                </div>
              ) : (
                <div style={{ ...styles.filePreview, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileIcon size={28} color="var(--color-text-muted)" />
                </div>
              )}

              {/* File info */}
              <div style={styles.fileInfo}>
                <span style={styles.fileName} title={file.name}>{file.name}</span>
                <span style={styles.fileSize}>{formatSize(file.size)}</span>
              </div>

              {/* Actions */}
              <div style={styles.fileActions}>
                <a
                  href={getFileUrl(projectId, ticketId, file.name)}
                  download={file.name}
                  title="Download"
                  style={styles.iconBtn}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download size={13} color="var(--color-text-muted)" />
                </a>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteMutation.mutate(file.name) }}
                  disabled={deleteMutation.isPending}
                  title="Delete"
                  style={styles.iconBtn}
                >
                  <Trash2 size={13} color="var(--color-priority-high, #EF4444)" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview modal */}
      {previewFile && (
        <div
          style={styles.modalOverlay}
          onClick={() => setPreviewFile(null)}
        >
          <div
            style={styles.modalContent}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={styles.modalHeader}>
              <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--color-text)' }}>
                {previewFile.name}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
                  {formatSize(previewFile.size)}
                </span>
                <button onClick={() => setPreviewFile(null)} style={styles.iconBtn}>
                  <X size={16} color="var(--color-text-muted)" />
                </button>
              </div>
            </div>

            <div style={styles.modalBody}>
              {isPreviewable(previewFile.name) ? (
                <img
                  src={getFileUrl(projectId, ticketId, previewFile.name)}
                  alt={previewFile.name}
                  style={{ maxWidth: '100%', maxHeight: '70vh', objectFit: 'contain', borderRadius: '4px' }}
                  onError={(e) => {
                    const target = e.currentTarget
                    target.style.display = 'none'
                    if (target.parentElement) {
                      target.parentElement.innerHTML = '<div style="padding:40px;text-align:center;color:var(--color-text-muted)">Preview failed</div>'
                    }
                  }}
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', padding: '40px' }}>
                  <FileIcon size={48} color="var(--color-text-muted)" />
                  <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>
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
                onClick={() => {
                  deleteMutation.mutate(previewFile.name)
                  setPreviewFile(null)
                }}
                style={{ ...styles.toolbarBtn, color: 'var(--color-priority-high, #EF4444)', borderColor: 'var(--color-priority-high, #EF4444)' }}
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

const styles = {
  page: {
    padding: '24px 32px',
    height: '100%',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
    overflow: 'hidden',
  },
  center: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: '8px',
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    fontSize: '13px',
    color: 'var(--color-text-muted)',
    textDecoration: 'none',
    fontWeight: '500',
    flexShrink: 0,
  },
  header: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    padding: '20px 24px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    flexShrink: 0,
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  ticketId: {
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.05em',
    color: 'var(--color-primary)',
    fontFamily: 'monospace',
    background: '#CCFBF1',
    padding: '2px 8px',
    borderRadius: '4px',
    flexShrink: 0,
  },
  title: {
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--color-text)',
    margin: 0,
    lineHeight: 1.3,
  },
  titleInput: {
    flex: 1,
    fontSize: '18px',
    fontWeight: '700',
    color: 'var(--color-text)',
    border: '1px solid var(--color-primary)',
    borderRadius: '6px',
    padding: '4px 10px',
    fontFamily: 'inherit',
    outline: 'none',
    background: 'var(--color-background)',
  },
  metaRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    flexWrap: 'wrap' as const,
  },
  metaItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  metaLabel: {
    fontSize: '11px',
    fontWeight: '600',
    color: 'var(--color-text-muted)',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.05em',
  },
  select: {
    fontSize: '12px',
    padding: '4px 8px',
    border: '1px solid var(--color-border)',
    borderRadius: '5px',
    background: 'var(--color-background)',
    color: 'var(--color-text)',
    fontFamily: 'inherit',
    outline: 'none',
    cursor: 'pointer',
  },
  labelsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'wrap' as const,
  },
  labelChip: {
    fontSize: '11px',
    fontWeight: '600',
    padding: '2px 8px',
    borderRadius: '20px',
    background: '#CCFBF1',
    color: 'var(--color-primary)',
  },
  iconBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    padding: '3px',
    borderRadius: '4px',
    lineHeight: 1,
  },
  tabBar: {
    display: 'flex',
    gap: '2px',
    borderBottom: '2px solid var(--color-border)',
    flexShrink: 0,
  },
  tab: {
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: '500',
    color: 'var(--color-text-muted)',
    background: 'transparent',
    border: 'none',
    borderBottom: '2px solid transparent',
    marginBottom: '-2px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    transition: 'color 150ms ease, border-color 150ms ease',
  },
  tabActive: {
    color: 'var(--color-primary)',
    fontWeight: '700',
    borderBottomColor: 'var(--color-primary)',
  },
  tabContent: {
    flex: 1,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
    minHeight: 0,
  },
  docPane: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
  },
  docToolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '10px 16px',
    borderBottom: '1px solid var(--color-border)',
    flexShrink: 0,
  },
  toolbarBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '5px',
    padding: '5px 12px',
    fontSize: '12px',
    fontWeight: '600',
    border: '1px solid var(--color-border)',
    borderRadius: '5px',
    background: 'transparent',
    color: 'var(--color-text)',
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
    color: 'var(--color-text-muted)',
  },
  markdownBody: {
    flex: 1,
    overflow: 'auto',
    padding: '20px 24px',
    fontSize: '14px',
    lineHeight: 1.7,
    color: 'var(--color-text)',
  },
  emptyDoc: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-text-muted)',
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
    color: 'var(--color-text)',
    background: 'var(--color-background)',
    minHeight: 0,
    width: '100%',
    boxSizing: 'border-box' as const,
  },
  attachmentsPane: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'auto',
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: '12px',
    padding: '20px 24px',
    gap: '16px',
  },
  dropZone: {
    border: '2px dashed var(--color-border)',
    borderRadius: '10px',
    padding: '28px 20px',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    cursor: 'pointer',
    transition: 'border-color 150ms ease, background 150ms ease',
    flexShrink: 0,
  },
  fileGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
    gap: '12px',
  },
  fileCard: {
    background: 'var(--color-background)',
    border: '1px solid var(--color-border)',
    borderRadius: '8px',
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column' as const,
    transition: 'box-shadow 150ms ease',
  },
  filePreview: {
    height: '120px',
    overflow: 'hidden',
    background: 'var(--color-surface)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '8px',
  },
  fileInfo: {
    padding: '8px 10px 4px',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '2px',
  },
  fileName: {
    fontSize: '12px',
    fontWeight: '600',
    color: 'var(--color-text)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap' as const,
  },
  fileSize: {
    fontSize: '11px',
    color: 'var(--color-text-muted)',
  },
  fileActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '4px',
    padding: '4px 8px 8px',
  },
  modalOverlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modalContent: {
    background: 'var(--color-surface)',
    borderRadius: '12px',
    border: '1px solid var(--color-border)',
    maxWidth: '80vw',
    maxHeight: '85vh',
    display: 'flex',
    flexDirection: 'column' as const,
    overflow: 'hidden',
    boxShadow: '0 16px 48px rgba(0, 0, 0, 0.2)',
    minWidth: '320px',
  },
  modalHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    borderBottom: '1px solid var(--color-border)',
    flexShrink: 0,
  },
  modalBody: {
    flex: 1,
    overflow: 'auto',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px',
    background: 'var(--color-background)',
  },
  modalFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    padding: '12px 16px',
    borderTop: '1px solid var(--color-border)',
    flexShrink: 0,
  },
}
