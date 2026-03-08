import { Command } from 'commander'

export const serveCommand = new Command('serve')
  .description('Start the Loci server (REST API + MCP + UI) on localhost:3333')
  .option('-p, --port <number>', 'Port to listen on', '3333')
  .action((options) => {
    console.log(`Starting Loci server on port ${options.port}...`)
    console.log('(Server package not yet implemented — coming in Phase 2)')
  })
