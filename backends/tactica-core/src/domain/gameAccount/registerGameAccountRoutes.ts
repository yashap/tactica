import { InputValidationError } from '@tactica/errors'
import { getSessionUserId, tacticaRequestValidationErrorHandler } from '@tactica/fastify-utils'
import { type GameAccountStats, type GameAccountWithStats, tacticaCoreContract } from '@tactica/tactica-core-contract'
import { initServer } from '@ts-rest/fastify'
import type { FastifyInstance } from 'fastify'
import { type GameAccountRow } from '../../db/schema.js'
import { type JobQueue } from '../../jobs/jobQueue.js'
import { type GameRepository } from '../game/GameRepository.js'
import { type PuzzleRepository } from '../puzzle/PuzzleRepository.js'
import { type GameSourceRegistry } from '../gameSource/GameSource.js'
import { type GameAccountRepository } from './GameAccountRepository.js'

export interface GameAccountRoutesDeps {
  gameAccountRepository: GameAccountRepository
  gameRepository: GameRepository
  puzzleRepository: PuzzleRepository
  gameSources: GameSourceRegistry
  jobQueue: JobQueue
}

const toDto = (row: GameAccountRow, stats: GameAccountStats): GameAccountWithStats => ({
  id: row.id,
  userId: row.userId,
  source: row.source,
  externalUsername: row.externalUsername,
  lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  stats,
})

export const registerGameAccountRoutes = async (app: FastifyInstance, deps: GameAccountRoutesDeps): Promise<void> => {
  const { gameAccountRepository, gameRepository, puzzleRepository, gameSources, jobQueue } = deps
  const s = initServer()

  const buildStats = async (userId: string, account: GameAccountRow): Promise<GameAccountStats> => {
    const [gamesImported, gamesAnalyzed, puzzleCount, syncActive] = await Promise.all([
      gameRepository.countByGameAccount(userId, account.id),
      gameRepository.countAnalyzedByGameAccount(userId, account.id),
      puzzleRepository.countByGameAccount(userId, account.id),
      account.lastSyncJobId ? jobQueue.isImportJobActive(account.lastSyncJobId) : Promise.resolve(false),
    ])
    return { gamesImported, gamesAnalyzed, puzzleCount, syncActive }
  }

  const withStats = async (userId: string, account: GameAccountRow): Promise<GameAccountWithStats> =>
    toDto(account, await buildStats(userId, account))

  /** Enqueue an import job and remember its id (unless one is already queued for this account). */
  const startSync = async (userId: string, account: GameAccountRow): Promise<void> => {
    const jobId = await jobQueue.enqueueImportGames({ gameAccountId: account.id, userId })
    if (jobId) {
      await gameAccountRepository.setLastSyncJobId(userId, account.id, jobId)
    }
  }

  const router = s.router(tacticaCoreContract.gameAccounts, {
    list: async ({ request }) => {
      const userId = getSessionUserId(request)
      const rows = await gameAccountRepository.list(userId)
      const gameAccounts = await Promise.all(rows.map((row) => withStats(userId, row)))
      return { status: 200, body: { gameAccounts } }
    },
    get: async ({ params, request }) => {
      const userId = getSessionUserId(request)
      const row = await gameAccountRepository.findById(userId, params.id)
      if (!row) {
        return { status: 404, body: { message: 'Game account not found', code: 'NotFoundError' } }
      }
      return { status: 200, body: await withStats(userId, row) }
    },
    create: async ({ body, request }) => {
      const userId = getSessionUserId(request)
      const source = gameSources[body.source]
      if (!source) {
        throw new InputValidationError(`Linking ${body.source} accounts is not supported yet`)
      }
      const existing = await gameAccountRepository.list(userId)
      if (existing.some((account) => account.source === body.source)) {
        throw new InputValidationError(`You already have a linked ${body.source} account`)
      }
      if (!(await source.validateUsername(body.externalUsername))) {
        throw new InputValidationError(`No ${body.source} user named '${body.externalUsername}' found`)
      }
      const row = await gameAccountRepository.create({
        userId,
        source: body.source,
        externalUsername: body.externalUsername,
      })
      await startSync(userId, row)
      const refreshed = (await gameAccountRepository.findById(userId, row.id)) ?? row
      return { status: 201, body: await withStats(userId, refreshed) }
    },
    sync: async ({ params, request }) => {
      const userId = getSessionUserId(request)
      const row = await gameAccountRepository.findById(userId, params.id)
      if (!row) {
        return { status: 404, body: { message: 'Game account not found', code: 'NotFoundError' } }
      }
      await startSync(userId, row)
      const refreshed = (await gameAccountRepository.findById(userId, row.id)) ?? row
      return { status: 200, body: await withStats(userId, refreshed) }
    },
    delete: async ({ params, request }) => {
      const userId = getSessionUserId(request)
      await gameAccountRepository.delete(userId, params.id)
      return { status: 204, body: undefined }
    },
  })

  await app.register(s.plugin(router), {
    requestValidationErrorHandler: tacticaRequestValidationErrorHandler,
  })
}
