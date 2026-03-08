import { describe, it, expect, beforeEach, afterEach } from 'bun:test'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { openCommand } from '../commands/open'

// We test loci open by inspecting the command definition (options, description)
// and verifying the error path when no project is found. We DON'T test
// actual browser-opening since that's a system side-effect.

const PROJECT_ID = 'test-open-uuid'

let tmpHome: string
let tmpWorkspace: string

beforeEach(() => {
  tmpHome = mkdtempSync(join(tmpdir(), 'loci-open-home-'))
  tmpWorkspace = mkdtempSync(join(tmpdir(), 'loci-open-ws-'))
  process.env.HOME = tmpHome
})

afterEach(() => {
  rmSync(tmpHome, { recursive: true, force: true })
  rmSync(tmpWorkspace, { recursive: true, force: true })
})

describe('loci open command', () => {
  it('is registered with name "open" and description', () => {
    expect(openCommand.name()).toBe('open')
    expect(openCommand.description()).toContain('browser')
  })

  it('accepts a --port option', () => {
    const portOpt = openCommand.options.find((o) => o.long === '--port')
    expect(portOpt).toBeDefined()
    expect(portOpt?.defaultValue).toBe('3333')
  })

  it('exits with error when no .loci project is found', async () => {
    // Use a temp dir with no .loci
    const originalCwd = process.cwd
    process.cwd = () => tmpHome

    let exitCode: number | undefined
    const originalExit = process.exit.bind(process)
    process.exit = ((code?: number) => {
      exitCode = code
      throw new Error('process.exit called')
    }) as typeof process.exit

    let errorMessage = ''
    const originalError = console.error
    console.error = (...args: unknown[]) => { errorMessage = args.join(' ') }

    try {
      await openCommand.parseAsync(['node', 'loci', 'open'], { from: 'user' })
    } catch {
      // expected — process.exit throws in test
    } finally {
      process.cwd = originalCwd
      process.exit = originalExit
      console.error = originalError
    }

    expect(exitCode).toBe(1)
    expect(errorMessage).toContain('No Loci project found')
  })

  it('constructs correct URL from project.json and logs it', async () => {
    // Seed a project so findWorkspaceRoot works
    mkdirSync(join(tmpWorkspace, '.loci'), { recursive: true })
    writeFileSync(
      join(tmpWorkspace, '.loci', 'project.json'),
      JSON.stringify({
        id: PROJECT_ID,
        name: 'Test',
        prefix: 'TST',
        nextId: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
      }, null, 2)
    )

    const originalCwd = process.cwd
    process.cwd = () => tmpWorkspace

    const logged: string[] = []
    const originalLog = console.log
    console.log = (...args: unknown[]) => { logged.push(args.join(' ')) }

    try {
      // Actually invoke the command — spawn fires but is fire-and-forget (unref'd)
      await openCommand.parseAsync(['node', 'loci', 'open'], { from: 'user' })
    } finally {
      process.cwd = originalCwd
      console.log = originalLog
    }

    const expectedUrl = `http://localhost:3333/project/${PROJECT_ID}`
    expect(logged.some((line) => line.includes(expectedUrl))).toBe(true)
  })
})
