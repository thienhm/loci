#!/usr/bin/env bun
import { Command } from 'commander'
import { initCommand } from './commands/init'
import { addCommand } from './commands/add'
import { listCommand } from './commands/list'
import { statusCommand } from './commands/status'
import { serveCommand } from './commands/serve'

const program = new Command()

program
  .name('loci')
  .description('Local ticket management tool')
  .version('0.1.0')

program.addCommand(initCommand)
program.addCommand(addCommand)
program.addCommand(listCommand)
program.addCommand(statusCommand)
program.addCommand(serveCommand)

program.parse()
