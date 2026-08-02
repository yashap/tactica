import { config } from './config.js'
import { log } from './log.js'
import { buildServer } from './server.js'
import { UciEngine } from './UciEngine.js'

const start = async (): Promise<void> => {
  const engine = new UciEngine({
    binaryPath: config.stockfishPath,
    threads: config.engine.threads,
    hashMb: config.engine.hashMb,
    handshakeTimeoutMs: config.engine.handshakeTimeoutMs,
    searchGraceMs: config.engine.searchGraceMs,
    shutdownTimeoutMs: config.engine.shutdownTimeoutMs,
  })

  // Hand-shake before we start listening: this container exists only to run the engine, so if the
  // binary is missing or broken we want to fail loudly at startup rather than serve a broken /health.
  await engine.start()

  const server = buildServer(engine)
  await new Promise<void>((resolve) => server.listen(config.port, config.host, resolve))
  log.info(`stockfish service listening on http://${config.host}:${config.port}`)

  let shuttingDown = false
  const shutdown = (signal: string): void => {
    if (shuttingDown) return
    shuttingDown = true
    log.info('shutting down', { signal })
    server.close(() => {
      void engine.stop().then(() => process.exit(0))
    })
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

start().catch((error: unknown) => {
  log.error('failed to start stockfish service', { err: (error as Error).message })
  process.exit(1)
})
