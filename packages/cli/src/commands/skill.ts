import { Command } from 'commander'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

const BUNDLED_SKILL = join(import.meta.dir, '../../../../skills/loci/SKILL.md')
const DEFAULT_DEST = join(process.env.HOME!, '.claude', 'skills', 'loci', 'SKILL.md')

export const skillCommand = new Command('skill')
  .description('Manage the Loci AI agent skill for Claude Code')
  .addCommand(
    new Command('install')
      .description('Install the Loci skill to ~/.claude/skills/loci/SKILL.md')
      .option('--dest <path>', 'Custom destination path', DEFAULT_DEST)
      .option('--force', 'Overwrite existing skill without prompting')
      .action((opts: { dest: string; force?: boolean }) => {
        if (!existsSync(BUNDLED_SKILL)) {
          console.error('Error: Bundled skill not found. Please reinstall Loci.')
          process.exit(1)
        }

        const destPath = opts.dest
        if (existsSync(destPath) && !opts.force) {
          console.error(`Skill already installed at ${destPath}`)
          console.error('Use --force to overwrite.')
          process.exit(1)
        }

        const destDir = destPath.replace(/\/[^/]+$/, '')
        mkdirSync(destDir, { recursive: true })
        writeFileSync(destPath, readFileSync(BUNDLED_SKILL, 'utf8'), 'utf8')
        console.log(`✓ Loci skill installed at ${destPath}`)
      })
  )
