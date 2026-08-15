import { getSessionUserId, tacticaRequestValidationErrorHandler } from '@tactica/fastify-utils'
import { buildPaginatedResponse, parsePagination } from '@tactica/pagination'
import { type Game, type GameWithPgn, tacticaCoreContract } from '@tactica/tactica-core-contract'
import { initServer } from '@ts-rest/fastify'
import type { FastifyInstance } from 'fastify'
import { type GameRow } from '../../db/schema.js'
import { type GameRepository, parseGameOrdering } from './GameRepository.js'

export interface GameRoutesDeps {
  gameRepository: GameRepository
}

const toDto = (row: GameRow): Game => ({
  id: row.id,
  userId: row.userId,
  gameAccountId: row.gameAccountId,
  source: row.source,
  externalGameId: row.externalGameId,
  playedAt: row.playedAt.toISOString(),
  timeControl: row.timeControl,
  userColor: row.userColor,
  opponentUsername: row.opponentUsername,
  result: row.result,
  analysisStatus: row.analysisStatus,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

const toDtoWithPgn = (row: GameRow): GameWithPgn => ({ ...toDto(row), pgn: row.pgn })

export const registerGameRoutes = async (app: FastifyInstance, deps: GameRoutesDeps): Promise<void> => {
  const { gameRepository } = deps
  const s = initServer()

  const router = s.router(tacticaCoreContract.games, {
    list: async ({ query, request }) => {
      const userId = getSessionUserId(request)
      const pagination = parsePagination(query, parseGameOrdering)
      const rows = await gameRepository.list(userId, pagination)
      return { status: 200, body: buildPaginatedResponse(rows.map(toDto), pagination) }
    },
    get: async ({ params, request }) => {
      const userId = getSessionUserId(request)
      const row = await gameRepository.findById(userId, params.id)
      if (!row) {
        return { status: 404, body: { message: 'Game not found', code: 'NotFoundError' } }
      }
      return { status: 200, body: toDtoWithPgn(row) }
    },
  })

  await app.register(s.plugin(router), {
    requestValidationErrorHandler: tacticaRequestValidationErrorHandler,
  })
}
