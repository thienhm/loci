import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import type { Project, Registry, RegistryEntry } from '@loci/shared'

function registryPath(): string {
  return join(process.env.HOME!, '.loci', 'registry.json')
}
const LOCI_DIR = '.loci'

/**
 * Walk up the directory tree from cwd to find the nearest .loci/ folder.
 * Returns the workspace root path, or null if not found.
 */
export function findWorkspaceRoot(startDir = process.cwd()): string | null {
  let dir = startDir
  while (true) {
    if (existsSync(join(dir, LOCI_DIR))) return dir
    const parent = dirname(dir)
    if (parent === dir) return null // reached filesystem root
    dir = parent
  }
}

export function getLociDir(workspaceRoot: string): string {
  return join(workspaceRoot, LOCI_DIR)
}

export function getProjectJsonPath(workspaceRoot: string): string {
  return join(workspaceRoot, LOCI_DIR, 'project.json')
}

export function readProject(workspaceRoot: string): Project {
  return JSON.parse(readFileSync(getProjectJsonPath(workspaceRoot), 'utf8'))
}

export function writeProject(workspaceRoot: string, project: Project): void {
  writeFileSync(getProjectJsonPath(workspaceRoot), JSON.stringify(project, null, 2))
}

export function readRegistry(): Registry {
  const path = registryPath()
  if (!existsSync(path)) return { projects: [] }
  return JSON.parse(readFileSync(path, 'utf8'))
}

export function writeRegistry(registry: Registry): void {
  const path = registryPath()
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(path, JSON.stringify(registry, null, 2))
}

export function getTicketsDir(workspaceRoot: string): string {
  return join(workspaceRoot, LOCI_DIR, 'tickets')
}
