# LCI-027: Ticket Detail — Attach File Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the path-based attachment input with real file upload supporting drag-and-drop, image/GIF previews in a grid layout.

**Architecture:** Backend adds 4 new file endpoints under `/files` using `@fastify/multipart`. Files stored on disk at `.loci/tickets/<ID>/files/`. Uploaded `.md` files are saved as ticket docs instead. Frontend replaces the AttachmentsTab with a drop zone + file grid with image previews.

**Tech Stack:** Fastify + @fastify/multipart (backend), React + @tanstack/react-query (frontend), no additional frontend libraries needed (native drag-and-drop API).

---

## Task 1: Install @fastify/multipart

**Files:**
- Modify: `packages/server/package.json`
- Modify: `packages/server/src/server.ts:16-34`

**Step 1: Install the dependency**

Run: `cd /Users/thienhuynh/Workspace/loci && bun add @fastify/multipart --cwd packages/server`

**Step 2: Register the plugin in server.ts**

Add after the cors registration (line 21):

```typescript
import multipart from '@fastify/multipart'

// inside createServer, after cors registration:
await app.register(multipart)
```

**Step 3: Verify server starts**

Run: `cd /Users/thienhuynh/Workspace/loci && bun run --cwd packages/server dev`
Expected: Server starts without errors on port 3333.

**Step 4: Commit**

```
feat(server): register @fastify/multipart plugin (LCI-027)
```

---

## Task 2: Add file storage helpers in data.ts

**Files:**
- Modify: `packages/server/src/data.ts:110-123`
- Test: `packages/server/src/__tests__/routes.test.ts`

**Step 1: Write failing tests for file helpers**

Add to `packages/server/src/__tests__/routes.test.ts`:

```typescript
// ---------------------------------------------------------------------------
// File upload endpoints: POST/GET/DELETE /api/projects/:projectId/tickets/:ticketId/files
// ---------------------------------------------------------------------------

describe('file upload endpoints', () => {
  it('POST /files uploads a file and GET /files lists it', async () => {
    seedTicket('TST-001')
    const boundary = '----FormBoundary'
    const filename = 'test-image.png'
    const fileContent = Buffer.from('fake-png-content')
    const body = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="${filename}"`,
      'Content-Type: image/png',
      '',
      fileContent.toString(),
      `--${boundary}--`,
    ].join('\r\n')

    const upload = await app.inject({
      method: 'POST',
      url: `/api/projects/${PROJECT_ID}/tickets/TST-001/files`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      body,
    })
    expect(upload.statusCode).toBe(201)
    const uploadBody = upload.json<any>()
    expect(uploadBody.name).toBe('test-image.png')
    expect(uploadBody.size).toBeGreaterThan(0)

    // List files
    const list = await app.inject({
      method: 'GET',
      url: `/api/projects/${PROJECT_ID}/tickets/TST-001/files`,
    })
    expect(list.statusCode).toBe(200)
    const files = list.json<any[]>()
    expect(files).toHaveLength(1)
    expect(files[0].name).toBe('test-image.png')
    expect(files[0].mimeType).toBe('image/png')
  })

  it('GET /files/:filename serves the file', async () => {
    seedTicket('TST-001')
    // Seed a file directly
    const { mkdirSync, writeFileSync } = await import('fs')
    const filesDir = join(tmpWorkspace, '.loci', 'tickets', 'TST-001', 'files')
    mkdirSync(filesDir, { recursive: true })
    writeFileSync(join(filesDir, 'hello.txt'), 'hello world')

    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${PROJECT_ID}/tickets/TST-001/files/hello.txt`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.body).toBe('hello world')
  })

  it('GET /files/:filename returns 404 for missing file', async () => {
    seedTicket('TST-001')
    const res = await app.inject({
      method: 'GET',
      url: `/api/projects/${PROJECT_ID}/tickets/TST-001/files/nope.txt`,
    })
    expect(res.statusCode).toBe(404)
  })

  it('DELETE /files/:filename removes the file', async () => {
    seedTicket('TST-001')
    const { mkdirSync, writeFileSync } = await import('fs')
    const filesDir = join(tmpWorkspace, '.loci', 'tickets', 'TST-001', 'files')
    mkdirSync(filesDir, { recursive: true })
    writeFileSync(join(filesDir, 'delete-me.txt'), 'bye')

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/projects/${PROJECT_ID}/tickets/TST-001/files/delete-me.txt`,
    })
    expect(del.statusCode).toBe(204)

    // Verify it's gone
    const list = await app.inject({
      method: 'GET',
      url: `/api/projects/${PROJECT_ID}/tickets/TST-001/files`,
    })
    expect(list.json<any[]>()).toHaveLength(0)
  })

  it('POST /files handles filename collision by appending counter', async () => {
    seedTicket('TST-001')
    const { mkdirSync, writeFileSync } = await import('fs')
    const filesDir = join(tmpWorkspace, '.loci', 'tickets', 'TST-001', 'files')
    mkdirSync(filesDir, { recursive: true })
    writeFileSync(join(filesDir, 'photo.png'), 'existing')

    const boundary = '----FormBoundary'
    const body = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="photo.png"`,
      'Content-Type: image/png',
      '',
      'new-content',
      `--${boundary}--`,
    ].join('\r\n')

    const upload = await app.inject({
      method: 'POST',
      url: `/api/projects/${PROJECT_ID}/tickets/TST-001/files`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      body,
    })
    expect(upload.statusCode).toBe(201)
    expect(upload.json<any>().name).toBe('photo(1).png')
  })

  it('POST /files saves .md uploads as ticket docs instead of files', async () => {
    seedTicket('TST-001')
    const boundary = '----FormBoundary'
    const body = [
      `--${boundary}`,
      `Content-Disposition: form-data; name="file"; filename="notes.md"`,
      'Content-Type: text/markdown',
      '',
      '# My Notes',
      `--${boundary}--`,
    ].join('\r\n')

    const upload = await app.inject({
      method: 'POST',
      url: `/api/projects/${PROJECT_ID}/tickets/TST-001/files`,
      headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
      body,
    })
    expect(upload.statusCode).toBe(201)
    expect(upload.json<any>().savedAsDoc).toBe(true)

    // Verify it's accessible as a doc
    const doc = await app.inject({
      method: 'GET',
      url: `/api/projects/${PROJECT_ID}/tickets/TST-001/docs/notes.md`,
    })
    expect(doc.statusCode).toBe(200)
    expect(doc.body).toContain('# My Notes')
  })
})
```

**Step 2: Run tests to verify they fail**

Run: `cd /Users/thienhuynh/Workspace/loci && bun test --cwd packages/server`
Expected: All new file upload tests FAIL (routes not defined yet).

**Step 3: Add file helper functions to data.ts**

Add to the end of `packages/server/src/data.ts` (after the attachments section):

```typescript
// ---------------------------------------------------------------------------
// File storage helpers
// ---------------------------------------------------------------------------

export function getFilesDir(workspaceRoot: string, ticketId: string): string {
  return join(getTicketDir(workspaceRoot, ticketId), 'files')
}

export interface FileInfo {
  name: string
  size: number
  mimeType: string
}

export function listFiles(workspaceRoot: string, ticketId: string): FileInfo[] {
  const dir = getFilesDir(workspaceRoot, ticketId)
  if (!existsSync(dir)) return []

  const { statSync } = require('fs') as typeof import('fs')
  const entries = readdirSync(dir, { withFileTypes: true })
  return entries
    .filter((e) => e.isFile())
    .map((e) => {
      const stat = statSync(join(dir, e.name))
      return {
        name: e.name,
        size: stat.size,
        mimeType: guessMimeType(e.name),
      }
    })
}

export function resolveUniqueFilename(dir: string, filename: string): string {
  if (!existsSync(join(dir, filename))) return filename

  const dotIdx = filename.lastIndexOf('.')
  const base = dotIdx > 0 ? filename.slice(0, dotIdx) : filename
  const ext = dotIdx > 0 ? filename.slice(dotIdx) : ''

  let counter = 1
  while (existsSync(join(dir, `${base}(${counter})${ext}`))) {
    counter++
  }
  return `${base}(${counter})${ext}`
}

function guessMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    webp: 'image/webp',
    pdf: 'application/pdf',
    md: 'text/markdown',
    txt: 'text/plain',
    json: 'application/json',
  }
  return map[ext ?? ''] ?? 'application/octet-stream'
}
```

Note: Use `statSync` imported inline since it's not in the existing top-level import. Or add it to the top-level import from `'fs'` — add `statSync` to the destructured import on line 1.

**Step 4: Add file routes to routes.ts**

Add to `packages/server/src/routes.ts`, after the attachments section (after line 222), and add imports at the top:

```typescript
// Add to imports from './data' (line 4-16):
import {
  // ... existing imports ...
  getFilesDir,
  listFiles,
  resolveUniqueFilename,
} from './data'

// Add these imports at top of file:
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

// ---------------------------------------------------------------------------
// Files (upload/download/delete)
// ---------------------------------------------------------------------------

// GET /api/projects/:projectId/tickets/:ticketId/files
app.get<{ Params: { projectId: string; ticketId: string } }>(
  '/api/projects/:projectId/tickets/:ticketId/files',
  async (req, reply) => {
    const entry = findRegistryEntry(req.params.projectId)
    if (!entry) return reply.status(404).send({ error: 'Project not found' })

    const files = listFiles(entry.path, req.params.ticketId)
    return reply.send(files)
  }
)

// POST /api/projects/:projectId/tickets/:ticketId/files
app.post<{ Params: { projectId: string; ticketId: string } }>(
  '/api/projects/:projectId/tickets/:ticketId/files',
  async (req, reply) => {
    const entry = findRegistryEntry(req.params.projectId)
    if (!entry) return reply.status(404).send({ error: 'Project not found' })

    const data = await req.file()
    if (!data) return reply.status(400).send({ error: 'No file provided' })

    const filename = data.filename
    const buffer = await data.toBuffer()

    // Markdown files get saved as ticket docs
    if (filename.endsWith('.md')) {
      writeTicketDoc(entry.path, req.params.ticketId, filename, buffer.toString('utf-8'))
      return reply.status(201).send({
        name: filename,
        size: buffer.length,
        mimeType: 'text/markdown',
        savedAsDoc: true,
      })
    }

    // Regular files go to files/ directory
    const filesDir = getFilesDir(entry.path, req.params.ticketId)
    mkdirSync(filesDir, { recursive: true })

    const uniqueName = resolveUniqueFilename(filesDir, filename)
    writeFileSync(join(filesDir, uniqueName), buffer)

    return reply.status(201).send({
      name: uniqueName,
      size: buffer.length,
      mimeType: data.mimetype || 'application/octet-stream',
      savedAsDoc: false,
    })
  }
)

// GET /api/projects/:projectId/tickets/:ticketId/files/:filename
app.get<{ Params: { projectId: string; ticketId: string; filename: string } }>(
  '/api/projects/:projectId/tickets/:ticketId/files/:filename',
  async (req, reply) => {
    const entry = findRegistryEntry(req.params.projectId)
    if (!entry) return reply.status(404).send({ error: 'Project not found' })

    const filePath = join(getFilesDir(entry.path, req.params.ticketId), req.params.filename)
    if (!existsSync(filePath)) return reply.status(404).send({ error: 'File not found' })

    const content = readFileSync(filePath)
    return reply.type('application/octet-stream').send(content)
  }
)

// DELETE /api/projects/:projectId/tickets/:ticketId/files/:filename
app.delete<{ Params: { projectId: string; ticketId: string; filename: string } }>(
  '/api/projects/:projectId/tickets/:ticketId/files/:filename',
  async (req, reply) => {
    const entry = findRegistryEntry(req.params.projectId)
    if (!entry) return reply.status(404).send({ error: 'Project not found' })

    const filePath = join(getFilesDir(entry.path, req.params.ticketId), req.params.filename)
    if (!existsSync(filePath)) return reply.status(404).send({ error: 'File not found' })

    unlinkSync(filePath)
    return reply.status(204).send()
  }
)
```

**Step 5: Register multipart in the test buildApp function**

In `packages/server/src/__tests__/routes.test.ts`, update `buildApp()`:

```typescript
import multipart from '@fastify/multipart'

async function buildApp() {
  const instance = Fastify({ logger: false })
  await instance.register(cors, { origin: true })
  await instance.register(multipart)
  // ... rest unchanged
}
```

**Step 6: Run tests to verify they pass**

Run: `cd /Users/thienhuynh/Workspace/loci && bun test --cwd packages/server`
Expected: All tests PASS.

**Step 7: Commit**

```
feat(server): add file upload/download/delete endpoints (LCI-027)
```

---

## Task 3: Add file API client functions

**Files:**
- Modify: `packages/web/src/api/client.ts:102-123`

**Step 1: Add the 4 new functions to client.ts**

Add after the existing `writeAttachments` function (line 123):

```typescript
// File uploads
export interface UploadedFile {
  name: string
  size: number
  mimeType: string
  savedAsDoc: boolean
}

export async function uploadFile(
  projectId: string,
  ticketId: string,
  file: File
): Promise<UploadedFile> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/projects/${projectId}/tickets/${ticketId}/files`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
  return res.json()
}

export async function listFiles(
  projectId: string,
  ticketId: string
): Promise<UploadedFile[]> {
  return get<UploadedFile[]>(`/projects/${projectId}/tickets/${ticketId}/files`)
}

export function getFileUrl(
  projectId: string,
  ticketId: string,
  filename: string
): string {
  return `${BASE}/projects/${projectId}/tickets/${ticketId}/files/${encodeURIComponent(filename)}`
}

export async function deleteFile(
  projectId: string,
  ticketId: string,
  filename: string
): Promise<void> {
  const res = await fetch(
    `${BASE}/projects/${projectId}/tickets/${ticketId}/files/${encodeURIComponent(filename)}`,
    { method: 'DELETE' }
  )
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`)
}
```

**Step 2: Commit**

```
feat(web): add file upload/download/delete API client functions (LCI-027)
```

---

## Task 4: Rewrite AttachmentsTab with drag-and-drop + file grid

**Files:**
- Modify: `packages/web/src/pages/TicketDetailPage.tsx:563-657` (AttachmentsTab component)
- Modify: `packages/web/src/pages/TicketDetailPage.tsx:1-29` (imports)
- Modify: `packages/web/src/pages/TicketDetailPage.tsx:897-951` (styles)

**Step 1: Update imports at top of TicketDetailPage.tsx**

Add to the imports:

```typescript
import {
  fetchTicket,
  fetchDoc,
  writeDoc,
  fetchAttachments,
  writeAttachments,
  updateTicket,
  uploadFile,
  listFiles,
  getFileUrl,
  deleteFile,
} from '../api/client'
import type { UploadedFile } from '../api/client'
```

Add `Upload, Download, File as FileIcon, X` to the lucide-react import. Remove `Plus` if no longer needed elsewhere (check first — it's used in the old AttachmentsTab only, no other usage).

Actually, keep `Plus` — it may be useful. Add: `Upload, Download, FileIcon` (note: `File` must be imported as `FileIcon` to avoid collision with the global `File` type).

Update lucide-react import:

```typescript
import {
  ArrowLeft,
  Loader2,
  AlertCircle,
  Check,
  Pencil,
  Trash2,
  Plus,
  Eye,
  Edit2,
  Save,
  Archive,
  ArchiveRestore,
  Upload,
  Download,
  File as FileIcon,
  X,
} from 'lucide-react'
```

**Step 2: Replace the AttachmentsTab component (lines 567-657)**

Replace the entire `AttachmentsTab` function with:

```typescript
function AttachmentsTab({
  projectId,
  ticketId,
}: {
  projectId: string
  ticketId: string
}) {
  const queryClient = useQueryClient()
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploading, setUploading] = useState<string[]>([]) // filenames currently uploading
  const fileInputRef = useRef<HTMLInputElement>(null)

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
        if (result.savedAsDoc) {
          // Markdown was saved as a doc — refresh ticket to show new tab
          queryClient.invalidateQueries({ queryKey: ['ticket', projectId, ticketId] })
        }
      } catch {
        // Upload failed — silently skip (file just won't appear)
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
      e.target.value = '' // reset so same file can be selected again
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
            <div key={file.name} style={styles.fileCard}>
              {/* Preview or icon */}
              {isPreviewable(file.name) ? (
                <div style={styles.filePreview}>
                  <img
                    src={getFileUrl(projectId, ticketId, file.name)}
                    alt={file.name}
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: '4px' }}
                    onError={(e) => {
                      // On error, replace with file icon
                      const target = e.currentTarget
                      target.style.display = 'none'
                      target.parentElement!.innerHTML = '<div style="display:flex;align-items:center;justify-content:center;height:100%"><span style="color:var(--color-text-muted);font-size:11px">Preview failed</span></div>'
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
                >
                  <Download size={13} color="var(--color-text-muted)" />
                </a>
                <button
                  onClick={() => deleteMutation.mutate(file.name)}
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
    </div>
  )
}
```

**Step 3: Add/update styles**

Add these new styles to the `styles` object. Replace `attachmentsHint`, `addRow`, `attachmentInput`, `attachmentList`, `attachmentItem`, `attachmentPath` with:

```typescript
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
```

Remove old unused styles: `attachmentsHint`, `addRow`, `attachmentInput`, `attachmentList`, `attachmentItem`, `attachmentPath`.

**Step 4: Remove old imports**

Remove `fetchAttachments` and `writeAttachments` from the import (lines 25-26) since the old path-based attachment system is no longer used by this component. Check if they're used elsewhere first — they are only used in the old AttachmentsTab, so safe to remove from this file's imports.

**Step 5: Verify the UI works**

Run: `cd /Users/thienhuynh/Workspace/loci && bun run --cwd packages/web dev`
Then: Open the browser, navigate to a ticket detail page, click the Attachments tab.
Expected:
- Drop zone visible with "Drop files here or click to browse"
- Clicking the drop zone opens file picker
- Dragging a file highlights the zone
- Uploading an image shows it as a thumbnail in the grid
- Uploading a .md file creates a new doc tab
- Delete button removes a file
- Download link downloads the file

**Step 6: Commit**

```
feat(web): rewrite AttachmentsTab with drag-and-drop file upload and grid preview (LCI-027)
```

---

## Task 5: Add file preview modal

**Files:**
- Modify: `packages/web/src/pages/TicketDetailPage.tsx` (AttachmentsTab component + styles)

**Step 1: Add preview modal state to AttachmentsTab**

Add state inside the AttachmentsTab component:

```typescript
const [previewFile, setPreviewFile] = useState<UploadedFile | null>(null)
```

**Step 2: Make file cards clickable**

Wrap the existing `<div key={file.name} style={styles.fileCard}>` with an onClick:

```typescript
<div
  key={file.name}
  style={{ ...styles.fileCard, cursor: 'pointer' }}
  onClick={() => setPreviewFile(file)}
>
```

**Step 3: Add the FilePreviewModal component**

Add after the file grid in AttachmentsTab's return, before the closing `</div>`:

```typescript
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
      {/* Modal header */}
      <div style={styles.modalHeader}>
        <span style={{ fontSize: '14px', fontWeight: '600', color: 'var(--color-text)' }}>
          {previewFile.name}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: 'var(--color-text-muted)' }}>
            {formatSize(previewFile.size)}
          </span>
          <button
            onClick={() => setPreviewFile(null)}
            style={styles.iconBtn}
          >
            <X size={16} color="var(--color-text-muted)" />
          </button>
        </div>
      </div>

      {/* Modal body */}
      <div style={styles.modalBody}>
        {isPreviewable(previewFile.name) ? (
          <img
            src={getFileUrl(projectId, ticketId, previewFile.name)}
            alt={previewFile.name}
            style={{
              maxWidth: '100%',
              maxHeight: '70vh',
              objectFit: 'contain',
              borderRadius: '4px',
            }}
            onError={(e) => {
              const target = e.currentTarget
              target.style.display = 'none'
              target.parentElement!.innerHTML = '<div style="padding:40px;text-align:center;color:var(--color-text-muted)">Preview failed</div>'
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

      {/* Modal footer */}
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
```

**Step 4: Add modal styles**

Add to the `styles` object:

```typescript
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
```

**Step 5: Verify modal works**

1. Click an image file card → modal shows full-size preview + download button
2. Click a non-image file card → modal shows file icon + "No preview available" + download button
3. Click overlay or X button → modal closes
4. Delete from modal → file removed, modal closes

**Step 6: Commit**

```
feat(web): add file preview modal with download/delete actions (LCI-027)
```

---

## Task 6: Final verification and cleanup

**Step 1: Run all server tests**

Run: `cd /Users/thienhuynh/Workspace/loci && bun test --cwd packages/server`
Expected: All tests PASS.

**Step 2: Run TypeScript type check**

Run: `cd /Users/thienhuynh/Workspace/loci && bun run --cwd packages/web tsc --noEmit`
Expected: No type errors (or check if there's an existing type check script).

**Step 3: Manual smoke test**

1. Open ticket detail page → Attachments tab
2. Drag an image → appears in grid with thumbnail
3. Drag a .gif → appears with animated preview
4. Drag a .md file → new doc tab appears
5. Drag a .pdf → appears with file icon
6. Click a file card → preview modal opens
7. Image in modal → full-size preview shown
8. Non-image in modal → file icon + "No preview available"
9. Download button in modal → file downloads
10. Delete button in modal → file removed, modal closes
11. Click overlay/X → modal closes
12. Upload a file with same name as existing → counter appended

**Step 4: Commit final state**

If any fixes were needed, commit them now.
