import { ContractBuilder } from '@tactica/api-client-utils'
import { PaginationRequestSchema, PaginationResponseSchema } from '@tactica/pagination'
import { initContract } from '@ts-rest/core'
import { z } from 'zod'
import { GameSourceSchema } from './gameAccount.js'

const c = initContract()

export const ChessColorSchema = z.enum(['white', 'black'])
export type ChessColor = z.infer<typeof ChessColorSchema>

/** Result of the game from the account owner's perspective. */
export const GameResultSchema = z.enum(['win', 'loss', 'draw'])
export type GameResult = z.infer<typeof GameResultSchema>

export const GameAnalysisStatusSchema = z.enum(['pending', 'analyzing', 'analyzed', 'failed'])
export type GameAnalysisStatus = z.infer<typeof GameAnalysisStatusSchema>

/** List-friendly game DTO — excludes the PGN, which can be several KB per game. */
export const GameSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  gameAccountId: z.string().uuid(),
  source: GameSourceSchema,
  externalGameId: z.string(),
  playedAt: z.string().datetime(),
  timeControl: z.string(),
  userColor: ChessColorSchema,
  opponentUsername: z.string(),
  result: GameResultSchema,
  analysisStatus: GameAnalysisStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Game = z.infer<typeof GameSchema>

export const GameWithPgnSchema = GameSchema.extend({
  pgn: z.string(),
})
export type GameWithPgn = z.infer<typeof GameWithPgnSchema>

export const ListGamesResponseSchema = z.object({
  data: z.array(GameSchema),
  pagination: PaginationResponseSchema,
})

export const gameContract = c.router({
  list: {
    method: 'GET',
    path: '/games',
    query: PaginationRequestSchema,
    responses: ContractBuilder.buildListResponses(ListGamesResponseSchema),
    summary: 'List the authenticated user’s imported games (paginated, newest first by default)',
  },
  get: {
    method: 'GET',
    path: '/games/:id',
    pathParams: z.object({ id: z.string().uuid() }),
    responses: ContractBuilder.buildGetResponses(GameWithPgnSchema),
    summary: 'Get a single imported game, including its PGN',
  },
})
