import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// Each test gets an isolated HOME and workspace
let tmpHome: string
let tmpWorkspace: string

function setupEnv() {
  tmpHome = mkdtempSync(join(tmpdir(), 'loci-test-home-'))
  tmpWorkspace = mkdtempSync(join(tmpdir(), 'loci-test-ws-'))
  process.env.HOME = tmpHome
}

function teardownEnv() {
  rmSync(tmpHome, { recursive: true, force: true })
  rmSync(tmpWorkspace, { recursive: true, force: true })
}

function seedProject(root: string, prefix = 'TST', nextId = 1) {
  mkdirSync(join(root, '.loci', 'tickets'), { recursive: true })
  writeFileSync(
    join(root, '.loci', 'project.json'),
    JSON.stringify({ id: 'test-uuid', name: 'Test', prefix, nextId, createdAt: '2026-01-01T00:00:00.000Z' }, null, 2)
  )
}

// Import after env is set (lazy registry path reads HOME at call time)
import {
  findWorkspaceRoot,
  readProject,
  writeProject,
  readRegistry,
  writeRegistry,
  getTicketsDir,
  getLociDir,
} from '../project'

describe('findWorkspaceRoot', () => {
  beforeEach(setupEnv)
  afterEach(teardownEnv)

  it('returns workspace root when .loci exists at given dir', () => {
    seedProject(tmpWorkspace)
    expect(findWorkspaceRoot(tmpWorkspace)).toBe(tmpWorkspace)
  })

  it('finds root from a nested subdirectory', () => {
    seedProject(tmpWorkspace)
    const nested = join(tmpWorkspace, 'src', 'deep')
    mkdirSync(nested, { recursive: true })
    expect(findWorkspaceRoot(nested)).toBe(tmpWorkspace)
  })

  it('returns null when no .loci exists in the tree', () => {
    expect(findWorkspaceRoot(tmpdir())).toBeNull()
  })
})

describe('readProject / writeProject', () => {
  beforeEach(setupEnv)
  afterEach(teardownEnv)

  it('round-trips project data', () => {
    seedProject(tmpWorkspace, 'APP', 5)
    const project = readProject(tmpWorkspace)
    expect(project.prefix).toBe('APP')
    expect(project.nextId).toBe(5)
  })

  it('writeProject persists changes', () => {
    seedProject(tmpWorkspace)
    const project = readProject(tmpWorkspace)
    project.nextId = 99
    writeProject(tmpWorkspace, project)
    expect(readProject(tmpWorkspace).nextId).toBe(99)
  })
})

describe('readRegistry / writeRegistry', () => {
  beforeEach(setupEnv)
  afterEach(teardownEnv)

  it('returns empty registry when file does not exist', () => {
    const reg = readRegistry()
    expect(reg.projects).toEqual([])
  })

  it('round-trips registry data', () => {
    writeRegistry({
      projects: [{ id: 'abc', name: 'Foo', prefix: 'FOO', path: '/foo' }],
    })
    const reg = readRegistry()
    expect(reg.projects).toHaveLength(1)
    expect(reg.projects[0].prefix).toBe('FOO')
  })

  it('creates missing ~/.loci directory', () => {
    writeRegistry({ projects: [] })
    const registryPath = join(tmpHome, '.loci', 'registry.json')
    const raw = readFileSync(registryPath, 'utf8')
    expect(JSON.parse(raw).projects).toEqual([])
  })
})

describe('getLociDir / getTicketsDir', () => {
  it('returns correct paths', () => {
    expect(getLociDir('/my/project')).toBe('/my/project/.loci')
    expect(getTicketsDir('/my/project')).toBe('/my/project/.loci/tickets')
  })
})
