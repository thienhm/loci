import { Command } from 'commander'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import * as readline from 'readline'

const BUNDLED_SKILL = join(import.meta.dir, '../../../../skills/loci/SKILL.md')
const DEFAULT_DEST = join(process.env.HOME!, '.claude', 'skills', 'loci', 'SKILL.md')

function prompt(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer.trim()) }))
}

export const skillCommand = new Command('skill')
  .description('Manage the Loci AI agent skill for Claude Code')
  .addCommand(
    new Command('install')
      .description('Install the Loci skill into your Claude skills folder')
      .option('--dest <path>', 'Destination path (skips prompt)')
      .option('--force', 'Overwrite existing skill without prompting')
      .action(async (opts: { dest?: string; force?: boolean }) => {
        if (!existsSync(BUNDLED_SKILL)) {
          console.error('Error: Bundled skill not found. Please reinstall Loci.')
          process.exit(1)
        }

        let destPath = opts.dest
        if (!destPath) {
          const input = await prompt(`Skills folder path [${DEFAULT_DEST}]: `)
          destPath = input || DEFAULT_DEST
          // If user gave a directory, append the filename
          if (!destPath.endsWith('.md')) {
            destPath = join(destPath, 'loci', 'SKILL.md')
          }
        }

        if (existsSync(destPath) && !opts.force) {
          const confirm = await prompt(`Skill already exists at ${destPath}. Overwrite? [y/N]: `)
          if (confirm.toLowerCase() !== 'y') {
            console.log('Aborted.')
            process.exit(0)
          }
        }

        const destDir = destPath.replace(/\/[^/]+$/, '')
        mkdirSync(destDir, { recursive: true })
        writeFileSync(destPath, readFileSync(BUNDLED_SKILL, 'utf8'), 'utf8')
        console.log(`✓ Loci skill installed at ${destPath}`)
      })
  )
