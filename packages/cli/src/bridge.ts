import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { join, win32 } from 'path'

export type BridgeAction =
  | { kind: 'delegate'; binaryPath: string; args: string[] }
  | { kind: 'typescript'; commandName: string | undefined; warning: string }
  | { kind: 'retired'; commandName: string; message: string }
  | { kind: 'missing-rust-binary'; commandName: string; binaryPath: string; message: string }

type BridgeOptions = {
  platform?: NodeJS.Platform | string
  env?: Record<string, string | undefined>
  binaryExists?: (path: string) => boolean
}

export const rustPrimaryCommands = new Set([
  'init',
  'doctor',
  'add',
  'shape',
  'plan',
  'ready',
  'validate',
  'evidence',
  'trace',
  'decision',
  'backlog',
  'summary',
  'review',
  'upgrade',
  'update',
  'list',
  'get',
])

export const typescriptFallbackCommands = new Set([
  'serve',
  'open',
  'attachments',
])

export const retiredCommands = new Set(['sync', 'skill'])

export function managedRustBinaryPath(options: BridgeOptions = {}): string {
  const platform = options.platform ?? process.platform
  const env = options.env ?? process.env
  const home = env.HOME
  const base = platform === 'win32' ? env.USERPROFILE ?? home : home
  const name = platform === 'win32' ? 'loci.exe' : 'loci'
  const pathJoin = platform === 'win32' ? win32.join : join
  return pathJoin(base ?? '', '.loci', 'bin', name)
}

export function managedRustBinary(home = process.env.HOME, platform = process.platform): string {
  return managedRustBinaryPath({
    platform,
    env: { HOME: home, USERPROFILE: process.env.USERPROFILE },
  })
}

export function decideBridgeAction(args: string[], options: BridgeOptions = {}): BridgeAction {
  const command = firstCommand(args)
  const binaryPath = managedRustBinaryPath(options)
  const binaryExists = options.binaryExists ?? existsSync

  if (command && typescriptFallbackCommands.has(command)) {
    return {
      kind: 'typescript',
      commandName: command,
      warning: `Using TypeScript compatibility fallback for "loci ${command}".`,
    }
  }

  if (command && retiredCommands.has(command)) {
    return {
      kind: 'retired',
      commandName: command,
      message: buildRetiredCommandMessage(command),
    }
  }

  if (!command || args.includes('--version') || args.includes('-V')) {
    return {
      kind: 'typescript',
      commandName: command,
      warning: '',
    }
  }

  if (rustPrimaryCommands.has(command)) {
    if (binaryExists(binaryPath)) {
      return { kind: 'delegate', binaryPath, args }
    }

    return {
      kind: 'missing-rust-binary',
      commandName: command,
      binaryPath,
      message: buildMissingRustBinaryMessage(command, binaryPath),
    }
  }

  if (binaryExists(binaryPath)) {
    return { kind: 'delegate', binaryPath, args }
  }

  return {
    kind: 'missing-rust-binary',
    commandName: command,
    binaryPath,
    message: buildMissingRustBinaryMessage(command, binaryPath),
  }
}

export function buildRetiredCommandMessage(command: string): string {
  if (command === 'sync') {
    return [
      '`loci sync` has been retired during the Rust CLI cutover.',
      'Use `loci upgrade` for project template/doc upgrades and archived ticket layout migration.',
    ].join('\n')
  }

  if (command === 'skill') {
    return [
      '`loci skill` has been retired from the product CLI.',
      'Install or update Codex/Claude skills through your agent tooling or copy `skills/loci/SKILL.md` manually.',
    ].join('\n')
  }

  return `\`loci ${command}\` has been retired.`
}

export function planBridge(args: string[], options: BridgeOptions = {}): BridgeAction {
  return decideBridgeAction(args, options)
}

function firstCommand(args: string[]): string | undefined {
  return args.find((arg) => !arg.startsWith('-'))
}

export function buildMissingRustBinaryMessage(command: string, binaryPath: string): string {
  const guidance = command === 'update'
    ? 'Install a Loci release artifact from GitHub Releases, then retry `loci update`.'
    : 'Run `loci update` to install the managed Rust binary, then try again.'

  return [
    `Managed Rust Loci binary not found at ${binaryPath}.`,
    `\`loci ${command}\` is handled by the Rust CLI during the transition.`,
    guidance,
  ].join('\n')
}

export function executeBridge(args: string[]): boolean {
  const action = decideBridgeAction(args)

  if (action.kind === 'delegate') {
    const result = spawnSync(action.binaryPath, action.args, { stdio: 'inherit' })
    if (result.error) {
      console.error(`Failed to run managed Rust Loci binary: ${result.error.message}`)
      process.exit(1)
    }
    process.exit(result.status ?? 1)
  }

  if (action.kind === 'missing-rust-binary') {
    console.error(action.message)
    process.exit(1)
  }

  if (action.kind === 'retired') {
    console.error(action.message)
    process.exit(1)
  }

  if (action.warning) {
    console.warn(action.warning)
  }

  return false
}
