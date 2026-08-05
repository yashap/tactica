import { FastifyAppBuilder } from '@tactica/fastify-utils'
import { getLogger } from '@tactica/logging'
import { config } from './config.js'
import { registerEvaluateRoutes } from './registerEvaluateRoutes.js'
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

  const app = await FastifyAppBuilder.build({
    kind: 'internal',
    registerRoutes: async (instance) => {
      await registerEvaluateRoutes(instance, engine)
    },
  })

  await app.listen({ port: config.port, host: config.host })
  getLogger().info(`stockfish listening on http://${config.host}:${config.port}`)

  let shuttingDown = false
  const shutdown = (signal: string): void => {
    if (shuttingDown) return
    shuttingDown = true
    getLogger().info('Shutting down', { signal })
    void app
      .close()
      .then(() => engine.stop())
      .then(() => process.exit(0))
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

start().catch((error: unknown) => {
  getLogger().error('Failed to start stockfish', { err: (error as Error).message })
  process.exit(1)
})
