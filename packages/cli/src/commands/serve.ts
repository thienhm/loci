import { Command } from 'commander'
import { spawnSync } from 'child_process'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'
import { createServer } from '@loci/server'

// Workspace root is 4 levels up from packages/cli/src/commands/serve.ts
const WORKSPACE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..')

function runBuild(): boolean {
  console.log('Building packages...')
  const result = spawnSync('bun', ['run', 'build'], {
    cwd: WORKSPACE_ROOT,
    stdio: 'inherit',
  })
  return result.status === 0
}

export const serveCommand = new Command('serve')
  .description('Start the Loci server (REST API + UI) on localhost:3333')
  .option('-p, --port <number>', 'Port to listen on', '3333')
  .action(async (options) => {
    const port = parseInt(options.port, 10)
    if (isNaN(port) || port < 1 || port > 65535) {
      console.error(`✗ Invalid port: "${options.port}". Must be a number between 1 and 65535.`)
      process.exit(1)
    }

    const ok = runBuild()
    if (!ok) {
      console.error('✗ Build failed. Server not started.')
      process.exit(1)
    }

    await createServer(port)
  })
