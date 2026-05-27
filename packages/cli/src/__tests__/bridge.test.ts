import { describe, expect, it } from 'bun:test'
import { join } from 'path'
import { managedRustBinary, planBridge } from '../bridge'

describe('TypeScript to Rust CLI bridge', () => {
  it('delegates Rust-primary commands to the managed Rust binary when present', () => {
    const action = planBridge(['list', '--json'], {
      env: { HOME: '/tmp/loci-home' },
      binaryExists: () => true,
    })

    expect(action).toEqual({
      kind: 'delegate',
      binaryPath: join('/tmp/loci-home', '.loci', 'bin', 'loci'),
      args: ['list', '--json'],
    })
  })

  it('delegates Rust-primary command help to the managed Rust binary when present', () => {
    const action = planBridge(['list', '--help'], {
      env: { HOME: '/tmp/loci-home' },
      binaryExists: () => true,
    })

    expect(action).toEqual({
      kind: 'delegate',
      binaryPath: join('/tmp/loci-home', '.loci', 'bin', 'loci'),
      args: ['list', '--help'],
    })
  })

  it('keeps TypeScript-only commands as explicit fallbacks', () => {
    const action = planBridge(['serve', '--help'], {
      env: { HOME: '/tmp/loci-home' },
      binaryExists: () => false,
    })

    expect(action.kind).toBe('typescript')
    expect(action.commandName).toBe('serve')
    expect(action.warning).toContain('TypeScript compatibility fallback')
  })

  it('keeps status and patch as TypeScript fallbacks pending SQLite write-side ownership', () => {
    for (const command of ['status', 'patch']) {
      const action = planBridge([command, 'LCI-001'], {
        env: { HOME: '/tmp/loci-home' },
        binaryExists: () => true,
      })

      expect(action.kind).toBe('typescript')
      expect(action.commandName).toBe(command)
      expect(action.warning).toContain('TypeScript compatibility fallback')
    }
  })

  it('keeps unresolved compatibility commands as TypeScript fallbacks', () => {
    for (const command of ['serve', 'open', 'doc', 'attachments']) {
      const action = planBridge([command, '--help'], {
        env: { HOME: '/tmp/loci-home' },
        binaryExists: () => false,
      })

      expect(action.kind).toBe('typescript')
      expect(action.commandName).toBe(command)
    }
  })

  it('returns actionable guidance when Rust-primary commands cannot find the managed binary', () => {
    const action = planBridge(['get', 'LCI-001'], {
      env: { HOME: '/tmp/loci-home' },
      binaryExists: () => false,
    })

    expect(action.kind).toBe('missing-rust-binary')
    expect(action.commandName).toBe('get')
    expect(action.message).toContain(join('/tmp/loci-home', '.loci', 'bin', 'loci'))
    expect(action.message).toContain('loci update')
  })

  it('does not tell missing update commands to run update recursively', () => {
    const action = planBridge(['update'], {
      env: { HOME: '/tmp/loci-home' },
      binaryExists: () => false,
    })

    expect(action.kind).toBe('missing-rust-binary')
    expect(action.message).toContain('GitHub Releases')
    expect(action.message).not.toContain('Run `loci update` to install')
  })

  it('does not inspect the filesystem for TypeScript fallback commands', () => {
    let inspected = false
    const action = planBridge(['doc', 'read', 'LCI-001', 'description.md'], {
      env: { HOME: '/tmp/loci-home' },
      binaryExists: () => {
        inspected = true
        return false
      },
    })

    expect(action.kind).toBe('typescript')
    expect(inspected).toBe(false)
  })

  it('retires sync with migration guidance instead of keeping a TypeScript fallback', () => {
    const action = planBridge(['sync'], {
      env: { HOME: '/tmp/loci-home' },
      binaryExists: () => true,
    })

    expect(action.kind).toBe('retired')
    expect(action.commandName).toBe('sync')
    expect(action.message).toContain('loci upgrade')
  })

  it('retires skill with agent-tooling guidance instead of keeping a TypeScript fallback', () => {
    const action = planBridge(['skill', 'install'], {
      env: { HOME: '/tmp/loci-home' },
      binaryExists: () => true,
    })

    expect(action.kind).toBe('retired')
    expect(action.commandName).toBe('skill')
    expect(action.message).toContain('agent tooling')
  })

  it('resolves the managed binary path under the user home', () => {
    expect(managedRustBinary('/Users/example')).toBe(join('/Users/example', '.loci', 'bin', 'loci'))
  })

  it('resolves the managed binary path under USERPROFILE on Windows', () => {
    const action = planBridge(['doctor'], {
      platform: 'win32',
      env: { USERPROFILE: 'C:\\Users\\example' },
      binaryExists: () => false,
    })

    expect(action.kind).toBe('missing-rust-binary')
    expect(action.binaryPath).toBe('C:\\Users\\example\\.loci\\bin\\loci.exe')
  })
})
