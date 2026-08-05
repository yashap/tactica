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
    // A second signal shouldn't restart the sequence, but it also shouldn't be ignored — if someone
    // is pressing Ctrl+C again, they want out now.
    if (shuttingDown) {
      getLogger().warn('Second shutdown signal, exiting immediately', { signal })
      process.exit(1)
    }
    shuttingDown = true
    const logger = getLogger()
    logger.info('Shutting down', { signal })

    // Backstop: nothing below is allowed to keep the process alive indefinitely. Without this, a
    // close() that hangs or rejects would leave the container running until something SIGKILLs it —
    // which is exactly how a stuck `pnpm serve:backend` shutdown looks from the outside. unref'd so
    // it never itself delays an otherwise-finished exit.
    const watchdog = setTimeout(() => {
      logger.error('Graceful shutdown timed out, exiting anyway', {
        deadlineMs: config.shutdownDeadlineMs,
      })
      process.exit(1)
    }, config.shutdownDeadlineMs)
    watchdog.unref()

    void (async () => {
      try {
        await app.close()
        await engine.stop()
      } catch (error) {
        logger.error('Error while shutting down, exiting anyway', { err: (error as Error).message })
      } finally {
        clearTimeout(watchdog)
        process.exit(0)
      }
    })()
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

start().catch((error: unknown) => {
  getLogger().error('Failed to start stockfish', { err: (error as Error).message })
  process.exit(1)
})
