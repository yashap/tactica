import { CorrelationIdPropagator } from '@tactica/correlation-id-propagator'
import { FastifyAppBuilder, requireSession } from '@tactica/fastify-utils'
import { getLogger } from '@tactica/logging'
import { TacticaAnalysisClient } from '@tactica/tactica-analysis-client'
import { initSuperTokens } from './auth/initSuperTokens.js'
import { config } from './config.js'
import { db } from './db/client.js'
import { GameAccountRepository } from './domain/gameAccount/GameAccountRepository.js'
import { registerGameAccountRoutes } from './domain/gameAccount/registerGameAccountRoutes.js'
import { GameRepository } from './domain/game/GameRepository.js'
import { registerGameRoutes } from './domain/game/registerGameRoutes.js'
import { buildGameSourceRegistry } from './domain/gameSource/GameSource.js'
import { ChessComClient } from './domain/gameSource/ChessComClient.js'
import { ChessComGameSource } from './domain/gameSource/ChessComGameSource.js'
import { PuzzleRepository } from './domain/puzzle/PuzzleRepository.js'
import { registerPuzzleRoutes } from './domain/puzzle/registerPuzzleRoutes.js'
import { registerSessionRoutes } from './domain/session/registerSessionRoutes.js'
import { buildAnalyzeGameJob } from './jobs/analyzeGameJob.js'
import { buildImportGamesJob } from './jobs/importGamesJob.js'
import { JobQueue } from './jobs/jobQueue.js'

const start = async (): Promise<void> => {
  initSuperTokens()

  const gameAccountRepository = new GameAccountRepository(db)
  const gameRepository = new GameRepository(db)
  const puzzleRepository = new PuzzleRepository(db)
  const gameSources = buildGameSourceRegistry([new ChessComGameSource(new ChessComClient(config.chesscom))])
  const analysisClient = new TacticaAnalysisClient({
    baseUrl: config.analysis.url,
    internalApiKey: config.analysis.internalApiKey,
    // Forward the job's correlation id, so one game's trace runs core → analysis → stockfish
    requestHeaders: (): Record<string, string> => {
      const correlationId = CorrelationIdPropagator.getContext()
      return correlationId ? { 'x-correlation-id': correlationId } : {}
    },
  })

  // The import job hands games awaiting analysis to the analysis queue, which is the same queue that
  // owns it — hence the self-reference. Safe because `enqueueAnalysis` only runs once a job is
  // executing, long after construction.
  const jobQueue: JobQueue = new JobQueue(
    config.databaseUrl,
    {
      importGames: buildImportGamesJob({
        gameAccountRepository,
        gameRepository,
        gameSources,
        maxMonths: config.importMaxMonths,
        enqueueAnalysis: (payload) => jobQueue.enqueueAnalyzeGame(payload),
      }),
      analyzeGame: buildAnalyzeGameJob({
        gameRepository,
        puzzleRepository,
        analysisClient,
        pollIntervalMs: config.analysis.pollIntervalMs,
        pollTimeoutMs: config.analysis.pollTimeoutMs,
      }),
    },
    { analyzeGameTimeoutMs: config.analysis.pollTimeoutMs },
  )

  const app = await FastifyAppBuilder.build({
    kind: 'userFacing',
    websiteDomain: config.websiteDomain,
    registerRoutes: async (instance) => {
      // Every tactica-core route requires a SuperTokens session. The check is a hook on an
      // encapsulated child scope, so it guards exactly the routes registered inside it — by what the
      // router matched, never by string-matching `req.url`, which is still percent-encoded (so
      // `/%74actica-core/...` would route here yet slip past a prefix check). The /auth/* routes
      // from the SuperTokens plugin live outside this scope, reachable for sign up / sign in.
      await instance.register(async (authenticated) => {
        authenticated.addHook('preHandler', requireSession)
        await registerSessionRoutes(authenticated)
        await registerGameAccountRoutes(authenticated, {
          gameAccountRepository,
          gameRepository,
          puzzleRepository,
          gameSources,
          jobQueue,
        })
        await registerGameRoutes(authenticated, { gameRepository })
        await registerPuzzleRoutes(authenticated, { puzzleRepository })
      })
    },
  })

  await jobQueue.start({ worker: config.workerEnabled })
  await app.listen({ port: config.port, host: config.host })
  getLogger().info(`tactica-core listening on http://${config.host}:${config.port}`)

  // Stop accepting requests, then let in-flight jobs finish (bounded) so a restart doesn't leave a
  // game stuck `analyzing` until pg-boss's expiry notices.
  let stopping = false
  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return
    stopping = true
    getLogger().info('Shutting down tactica-core', { signal })
    await app.close()
    await jobQueue.stop()
    process.exit(0)
  }
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => void shutdown(signal))
  }
}

start().catch((error: unknown) => {
  getLogger().error('Failed to start tactica-core', { err: (error as Error).message })
  process.exit(1)
})
