import { Database } from 'bun:sqlite'
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { guessMimeType, resolveUniqueFilename } from './data'
import { hasSqliteRegistry, registryDbPath } from './sqliteData'

interface WriteError {
  statusCode: number
  message: string
}

interface RegistryRow {
  id: string
  path: string
  health_status: string
}

interface SqliteProject {
  path: string
  dbPath: string
}

interface FileRow {
  filename: string
  relative_path: string
  mime_type: string
  size_bytes: number
}

export interface SqliteFileInfo {
  name: string
  size: number
  mimeType: string
}

export function listSqliteAttachments(projectId: string, ticketId: string, home = process.env.HOME!): { attachments: string[] } | { error: WriteError } {
  const resolved = resolveReadableProject(projectId, home)
  if ('error' in resolved) return { error: resolved.error }

  importLegacyTicketFiles(resolved, ticketId)

  const db = new Database(resolved.dbPath)
  try {
    const rows = db
      .query<{ filename: string }, [string]>(`SELECT filename FROM ticket_file WHERE ticket_id = ?1 ORDER BY filename COLLATE NOCASE ASC`)
      .all(ticketId)
    return { attachments: rows.map((row) => row.filename) }
  } catch (error) {
    return { error: { statusCode: 500, message: errorMessage(error, 'Failed to list SQLite attachments') } }
  } finally {
    db.close()
  }
}

export function replaceSqliteAttachments(
  projectId: string,
  ticketId: string,
  filenames: string[],
  home = process.env.HOME!
): { error?: WriteError } {
  const resolved = resolveWritableProject(projectId, home)
  if ('error' in resolved) return { error: resolved.error }

  importLegacyTicketFiles(resolved, ticketId)

  const db = new Database(resolved.dbPath)
  try {
    const names = Array.from(new Set(filenames))
    const present = names.filter((name) => resolveAnyDiskPath(resolved.path, ticketId, name))

    const tx = db.transaction(() => {
      db.run(`DELETE FROM ticket_file WHERE ticket_id = ?1`, [ticketId])
      for (const filename of present) {
        const diskPath = resolveAnyDiskPath(resolved.path, ticketId, filename)
        if (!diskPath) continue
        const relativePath = diskPath.startsWith(resolved.path + '/') ? diskPath.slice(resolved.path.length + 1) : diskPath
        const stats = statSync(diskPath)
        const now = new Date().toISOString()
        db.run(
          `INSERT INTO ticket_file (ticket_id, filename, relative_path, mime_type, size_bytes, source, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, 'legacy_import', ?6, ?6)`,
          [ticketId, filename, relativePath, guessMimeType(filename), stats.size, now]
        )
      }
    })
    tx()
    return {}
  } catch (error) {
    return { error: { statusCode: 500, message: errorMessage(error, 'Failed to update SQLite attachments') } }
  } finally {
    db.close()
  }
}

export function listSqliteFiles(projectId: string, ticketId: string, home = process.env.HOME!): { files: SqliteFileInfo[] } | { error: WriteError } {
  const resolved = resolveReadableProject(projectId, home)
  if ('error' in resolved) return { error: resolved.error }

  importLegacyTicketFiles(resolved, ticketId)

  const db = new Database(resolved.dbPath)
  try {
    const rows = db
      .query<FileRow, [string]>(`SELECT filename, relative_path, mime_type, size_bytes FROM ticket_file WHERE ticket_id = ?1 ORDER BY filename COLLATE NOCASE ASC`)
      .all(ticketId)

    return {
      files: rows
        .map((row) => ({
          name: row.filename,
          size: safeSize(resolved.path, row.relative_path, row.size_bytes),
          mimeType: row.mime_type,
        }))
    }
  } catch (error) {
    return { error: { statusCode: 500, message: errorMessage(error, 'Failed to list SQLite files') } }
  } finally {
    db.close()
  }
}

export function uploadSqliteFile(
  projectId: string,
  ticketId: string,
  filename: string,
  buffer: Buffer,
  home = process.env.HOME!
): { name: string } | { error: WriteError } {
  const resolved = resolveWritableProject(projectId, home)
  if ('error' in resolved) return { error: resolved.error }

  importLegacyTicketFiles(resolved, ticketId)

  const targetDir = join(resolved.path, 'loci', 'tickets', ticketId, 'files')
  mkdirSync(targetDir, { recursive: true })

  const uniqueName = resolveUniqueFilename(targetDir, filename)
  const absolutePath = join(targetDir, uniqueName)
  writeFileSync(absolutePath, buffer)

  const relativePath = join('loci', 'tickets', ticketId, 'files', uniqueName)
  const now = new Date().toISOString()

  const db = new Database(resolved.dbPath)
  try {
    db.run(
      `INSERT INTO ticket_file (ticket_id, filename, relative_path, mime_type, size_bytes, source, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 'upload', ?6, ?6)`,
      [ticketId, uniqueName, relativePath, guessMimeType(uniqueName), buffer.length, now]
    )
    return { name: uniqueName }
  } catch (error) {
    return { error: { statusCode: 500, message: errorMessage(error, 'Failed to save SQLite file metadata') } }
  } finally {
    db.close()
  }
}

export function readSqliteFile(projectId: string, ticketId: string, filename: string, home = process.env.HOME!): { buffer: Buffer; mimeType: string } | { error: WriteError } {
  const resolved = resolveReadableProject(projectId, home)
  if ('error' in resolved) return { error: resolved.error }

  importLegacyTicketFiles(resolved, ticketId)

  const db = new Database(resolved.dbPath)
  try {
    const row = db
      .query<FileRow, [string, string]>(`SELECT filename, relative_path, mime_type, size_bytes FROM ticket_file WHERE ticket_id = ?1 AND filename = ?2`)
      .get(ticketId, filename)
    if (!row) return { error: { statusCode: 404, message: 'File not found' } }

    const path = join(resolved.path, row.relative_path)
    if (!existsSync(path)) return { error: { statusCode: 404, message: 'File not found' } }

    return { buffer: readFileSync(path), mimeType: row.mime_type }
  } catch (error) {
    return { error: { statusCode: 500, message: errorMessage(error, 'Failed to read SQLite file') } }
  } finally {
    db.close()
  }
}

export function deleteSqliteFile(projectId: string, ticketId: string, filename: string, home = process.env.HOME!): { error?: WriteError } {
  const resolved = resolveWritableProject(projectId, home)
  if ('error' in resolved) return { error: resolved.error }

  importLegacyTicketFiles(resolved, ticketId)

  const db = new Database(resolved.dbPath)
  try {
    const row = db
      .query<FileRow, [string, string]>(`SELECT filename, relative_path, mime_type, size_bytes FROM ticket_file WHERE ticket_id = ?1 AND filename = ?2`)
      .get(ticketId, filename)
    if (!row) return { error: { statusCode: 404, message: 'File not found' } }

    db.run(`DELETE FROM ticket_file WHERE ticket_id = ?1 AND filename = ?2`, [ticketId, filename])
    const path = join(resolved.path, row.relative_path)
    if (existsSync(path)) unlinkSync(path)
    return {}
  } catch (error) {
    return { error: { statusCode: 500, message: errorMessage(error, 'Failed to delete SQLite file') } }
  } finally {
    db.close()
  }
}

function importLegacyTicketFiles(project: SqliteProject, ticketId: string): void {
  const db = new Database(project.dbPath)
  try {
    const now = new Date().toISOString()

    const legacyFilesDir = join(project.path, '.loci', 'tickets', ticketId, 'files')
    if (existsSync(legacyFilesDir)) {
      for (const name of readdirSync(legacyFilesDir, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name)) {
        const absolute = join(legacyFilesDir, name)
        const stats = statSync(absolute)
        const relative = join('.loci', 'tickets', ticketId, 'files', name)
        db.run(
          `INSERT OR IGNORE INTO ticket_file (ticket_id, filename, relative_path, mime_type, size_bytes, source, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, 'legacy_import', ?6, ?6)`,
          [ticketId, name, relative, guessMimeType(name), stats.size, now]
        )
      }
    }

    const attachmentsPath = join(project.path, '.loci', 'tickets', ticketId, 'attachments.json')
    if (existsSync(attachmentsPath)) {
      const names = parseAttachmentList(readFileSync(attachmentsPath, 'utf8'))
      for (const name of names) {
        const absolute = resolveAnyDiskPath(project.path, ticketId, name)
        if (!absolute) continue
        const stats = statSync(absolute)
        const relative = absolute.slice(project.path.length + 1)
        db.run(
          `INSERT OR IGNORE INTO ticket_file (ticket_id, filename, relative_path, mime_type, size_bytes, source, created_at, updated_at)
           VALUES (?1, ?2, ?3, ?4, ?5, 'legacy_import', ?6, ?6)`,
          [ticketId, name, relative, guessMimeType(name), stats.size, now]
        )
      }
    }
  } finally {
    db.close()
  }
}

function parseAttachmentList(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((name) => typeof name === 'string') : []
  } catch {
    return []
  }
}

function resolveAnyDiskPath(projectRoot: string, ticketId: string, filename: string): string | null {
  const sqlitePath = join(projectRoot, 'loci', 'tickets', ticketId, 'files', filename)
  if (existsSync(sqlitePath)) return sqlitePath
  const legacyPath = join(projectRoot, '.loci', 'tickets', ticketId, 'files', filename)
  if (existsSync(legacyPath)) return legacyPath
  return null
}

function safeSize(projectRoot: string, relativePath: string, fallback: number): number {
  const absolute = join(projectRoot, relativePath)
  if (!existsSync(absolute)) return fallback
  return statSync(absolute).size
}

function resolveReadableProject(projectId: string, home: string): { error: WriteError } | SqliteProject {
  if (!hasSqliteRegistry(home)) {
    return { error: { statusCode: 404, message: 'SQLite registry is unavailable' } }
  }

  const registry = Database.open(registryDbPath(home), { readonly: true })
  try {
    const row = registry
      .query<RegistryRow, [string]>('SELECT id, path, health_status FROM registered_project WHERE id = ?1')
      .get(projectId)

    if (!row) return { error: { statusCode: 404, message: 'Project not found' } }

    const dbPath = join(row.path, '.loci', 'loci.db')
    if (!existsSync(dbPath)) {
      return { error: { statusCode: 409, message: `Project database is missing: ${dbPath}` } }
    }

    return { path: row.path, dbPath }
  } finally {
    registry.close()
  }
}

function resolveWritableProject(projectId: string, home: string): { error: WriteError } | SqliteProject {
  const resolved = resolveReadableProject(projectId, home)
  if ('error' in resolved) return resolved

  const registry = Database.open(registryDbPath(home), { readonly: true })
  try {
    const row = registry
      .query<RegistryRow, [string]>('SELECT id, path, health_status FROM registered_project WHERE id = ?1')
      .get(projectId)
    if (!row) return { error: { statusCode: 404, message: 'Project not found' } }
    if (row.health_status !== 'healthy') {
      return { error: { statusCode: 409, message: `Project is not writable (health status: ${row.health_status})` } }
    }
  } finally {
    registry.close()
  }

  return resolved
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}
