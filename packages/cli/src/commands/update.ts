import { Command } from 'commander'
import { join } from 'path'
import { findWorkspaceRoot, readProject } from '../project'
import { generateLociMd } from './init'

export const updateCommand = new Command('update')
  .description('Regenerate LOCI.md with the latest workflow instructions')
  .option('-p, --port <number>', 'port the server runs on', '3333')
  .action(async (opts) => {
    const cwd = process.cwd()
    const workspaceRoot = findWorkspaceRoot(cwd)

    if (!workspaceRoot) {
      console.error('Error: No Loci project found. Run `loci init` first.')
      process.exit(1)
    }

    const project = readProject(workspaceRoot)
    const port = parseInt(opts.port, 10)
    const lociMdPath = join(workspaceRoot, 'LOCI.md')

    await Bun.write(lociMdPath, generateLociMd(project, port))
    console.log(`✓ LOCI.md updated for project "${project.name}" (${project.prefix})`)
  })
