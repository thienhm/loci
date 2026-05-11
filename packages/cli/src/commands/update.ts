import { Command } from 'commander'
import { spawn } from 'child_process'
import { rmSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

function clearBunGitHubCache() {
  const base = join(homedir(), '.bun', 'install')
  // Remove cached tarball(s) for this package
  const cacheDir = join(base, 'cache')
  try {
    for (const entry of readdirSync(cacheDir)) {
      if (entry.startsWith('@GH@thienhm-loci-')) {
        rmSync(join(cacheDir, entry), { recursive: true, force: true })
      }
    }
  } catch {
    // cache dir missing or unreadable — proceed anyway
  }
  // Remove global lockfile so bun re-resolves the latest commit
  const lockfile = join(base, 'global', 'bun.lock')
  if (existsSync(lockfile)) {
    rmSync(lockfile, { force: true })
  }
}

export const updateCommand = new Command('update')
  .description('Pull the latest Loci version and update the global CLI')
  .action(() => {
    console.log('Fetching the latest Loci version from GitHub...')

    clearBunGitHubCache()

    const child = spawn('bun', ['install', '-g', 'github:thienhm/loci'], {
      stdio: 'inherit',
      shell: true,
    })

    child.on('exit', (code) => {
      if (code === 0) {
        console.log('\n✓ Loci updated successfully!')
        console.log('  Run `loci skill install` to update the AI agent skill.')
      } else {
        console.error('\n✗ Failed to update Loci. Exit code:', code)
        process.exit(code ?? 1)
      }
    })
  })
