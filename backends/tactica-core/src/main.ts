import { FastifyAppBuilder, requireSession } from '@tactica/fastify-utils'
import { getLogger } from '@tactica/logging'
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
import { registerSessionRoutes } from './domain/session/registerSessionRoutes.js'
import { buildImportGamesJob } from './jobs/importGamesJob.js'
import { JobQueue } from './jobs/jobQueue.js'

const start = async (): Promise<void> => {
  initSuperTokens()

  const gameAccountRepository = new GameAccountRepository(db)
  const gameRepository = new GameRepository(db)
  const gameSources = buildGameSourceRegistry([new ChessComGameSource(new ChessComClient(config.chesscom))])
  const jobQueue = new JobQueue(config.databaseUrl, {
    importGames: buildImportGamesJob({
      gameAccountRepository,
      gameRepository,
      gameSources,
      maxMonths: config.importMaxMonths,
    }),
  })

  const app = await FastifyAppBuilder.build({
    kind: 'userFacing',
    websiteDomain: config.websiteDomain,
    registerRoutes: async (instance) => {
      // Gate every /tactica-core/* path behind SuperTokens session verification. The /auth/*
      // paths handled by the SuperTokens plugin are unaffected — they need to be reachable
      // without a session so users can sign up / sign in.
      instance.addHook('preHandler', async (req, reply) => {
        if (req.url.startsWith('/tactica-core/')) {
          await requireSession(req, reply)
        }
      })
      await registerSessionRoutes(instance)
      await registerGameAccountRoutes(instance, { gameAccountRepository, gameRepository, gameSources, jobQueue })
      await registerGameRoutes(instance, { gameRepository })
    },
  })

  await jobQueue.start({ worker: config.workerEnabled })
  await app.listen({ port: config.port, host: config.host })
  getLogger().info(`tactica-core listening on http://${config.host}:${config.port}`)
}

start().catch((error: unknown) => {
  getLogger().error('Failed to start tactica-core', { err: (error as Error).message })
  process.exit(1)
})
