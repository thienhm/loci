import { createServer } from './server'

const port = parseInt(process.env.PORT ?? '3333', 10)

createServer(port).catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
