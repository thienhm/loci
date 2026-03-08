import { Command } from 'commander'
import { createServer } from '@loci/server'

export const serveCommand = new Command('serve')
  .description('Start the Loci server (REST API + UI) on localhost:3333')
  .option('-p, --port <number>', 'Port to listen on', '3333')
  .action(async (options) => {
    const port = parseInt(options.port, 10)
    await createServer(port)
  })
