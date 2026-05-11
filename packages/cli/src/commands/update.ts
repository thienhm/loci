import { Command } from 'commander'
import { spawnSync, spawn } from 'child_process'

export const updateCommand = new Command('update')
  .description('Pull the latest Loci version and update the global CLI')
  .action(() => {
    console.log('Fetching the latest Loci version from GitHub...')

    // Remove first so bun clears the lockfile pin, forcing fresh resolution
    spawnSync('bun', ['remove', '-g', 'loci'], { stdio: 'ignore', shell: true })

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
