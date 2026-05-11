#!/usr/bin/env bun
import { Command } from 'commander'
import { initCommand } from './commands/init'
import { addCommand } from './commands/add'
import { listCommand } from './commands/list'
import { statusCommand } from './commands/status'
import { serveCommand } from './commands/serve'
import { openCommand } from './commands/open'
import { updateCommand } from './commands/update'
import { syncCommand } from './commands/sync'
import { getCommand } from './commands/get'
import { patchCommand } from './commands/patch'
import { docCommand } from './commands/doc'
import { attachmentsCommand } from './commands/attachments'

const program = new Command()

program
  .name('loci')
  .description('Local ticket management tool')
  .version('0.1.3')

program.addCommand(initCommand)
program.addCommand(addCommand)
program.addCommand(listCommand)
program.addCommand(statusCommand)
program.addCommand(serveCommand)
program.addCommand(openCommand)
program.addCommand(updateCommand)
program.addCommand(syncCommand)
program.addCommand(getCommand)
program.addCommand(patchCommand)
program.addCommand(docCommand)
program.addCommand(attachmentsCommand)

program.parse()
