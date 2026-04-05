import { Command } from 'commander'
import { spawn } from 'child_process'

export const updateCommand = new Command('update')
  .description('Pull the latest Loci version and update the global CLI')
  .action(() => {
    console.log('Fetching the latest Loci version from GitHub...')

    const child = spawn('bun', ['install', '-g', 'github:thienhm/loci'], {
      stdio: 'inherit',
      shell: true,
    })

    child.on('exit', (code) => {
      if (code === 0) {
        console.log('\n✓ Loci updated successfully!')
      } else {
        console.error('\n✗ Failed to update Loci. Exit code:', code)
        process.exit(code ?? 1)
      }
    })
  })
