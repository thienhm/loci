#!/usr/bin/env bun
import { Command } from 'commander'
import { executeBridge } from './bridge'

async function runTypeScriptCli() {
  const [
    { initCommand },
    { addCommand },
    { listCommand },
    { statusCommand },
    { serveCommand },
    { openCommand },
    { updateCommand },
    { syncCommand },
    { getCommand },
    { patchCommand },
    { docCommand },
    { attachmentsCommand },
    { skillCommand },
  ] = await Promise.all([
    import('./commands/init'),
    import('./commands/add'),
    import('./commands/list'),
    import('./commands/status'),
    import('./commands/serve'),
    import('./commands/open'),
    import('./commands/update'),
    import('./commands/sync'),
    import('./commands/get'),
    import('./commands/patch'),
    import('./commands/doc'),
    import('./commands/attachments'),
    import('./commands/skill'),
  ])

  const program = new Command()

  program
    .name('loci')
    .description('Local ticket management tool')
    .version('2.0.0')

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
  program.addCommand(skillCommand)

  program.parse()
}

if (!executeBridge(process.argv.slice(2))) {
  await runTypeScriptCli()
}
