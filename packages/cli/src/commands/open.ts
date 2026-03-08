import { Command } from 'commander'
import { spawn } from 'node:child_process'
import { findWorkspaceRoot, readProject } from '../project'

/**
 * Opens the current project's board in the default browser.
 *
 * Cross-platform:
 *   macOS   — open <url>
 *   Linux   — xdg-open <url>
 *   Windows — start <url>
 */
function openUrl(url: string): void {
  const platform = process.platform
  const cmd =
    platform === 'darwin' ? 'open'
    : platform === 'win32' ? 'start'
    : 'xdg-open'

  spawn(cmd, [url], { detached: true, stdio: 'ignore' }).unref()
}

export const openCommand = new Command('open')
  .description('Open the current project board in a browser')
  .option('-p, --port <number>', 'Loci server port', '3333')
  .action((options) => {
    const root = findWorkspaceRoot()
    if (!root) {
      console.error('✗ No Loci project found. Run `loci init` first.')
      process.exit(1)
    }

    const project = readProject(root)
    const port = parseInt(options.port, 10)
    const url = `http://localhost:${port}/project/${project.id}`

    console.log(`Opening ${url}`)
    openUrl(url)
  })
