import { ContractBuilder } from '@tactica/api-client-utils'
import { initContract } from '@ts-rest/core'
import { z } from 'zod'

const c = initContract()

export const GameSourceSchema = z.enum(['chesscom', 'lichess'])
export type GameSource = z.infer<typeof GameSourceSchema>

export const GameAccountStatsSchema = z.object({
  gamesImported: z.number().int().nonnegative(),
  /** `true` while an import job for this account is queued or running. */
  syncActive: z.boolean(),
})
export type GameAccountStats = z.infer<typeof GameAccountStatsSchema>

export const GameAccountSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  source: GameSourceSchema,
  externalUsername: z.string(),
  lastSyncedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type GameAccount = z.infer<typeof GameAccountSchema>

export const GameAccountWithStatsSchema = GameAccountSchema.extend({
  stats: GameAccountStatsSchema,
})
export type GameAccountWithStats = z.infer<typeof GameAccountWithStatsSchema>

export const CreateGameAccountRequestSchema = z.object({
  source: GameSourceSchema,
  externalUsername: z.string().min(1).max(100),
})
export type CreateGameAccountRequest = z.infer<typeof CreateGameAccountRequestSchema>

export const ListGameAccountsResponseSchema = z.object({
  gameAccounts: z.array(GameAccountWithStatsSchema),
})

export const gameAccountContract = c.router({
  list: {
    method: 'GET',
    path: '/game-accounts',
    responses: ContractBuilder.buildListResponses(ListGameAccountsResponseSchema),
    summary: 'List the authenticated user’s linked game accounts (at most one per source)',
  },
  get: {
    method: 'GET',
    path: '/game-accounts/:id',
    pathParams: z.object({ id: z.string().uuid() }),
    responses: ContractBuilder.buildGetResponses(GameAccountWithStatsSchema),
    summary: 'Get a linked game account, with import progress stats',
  },
  create: {
    method: 'POST',
    path: '/game-accounts',
    body: CreateGameAccountRequestSchema,
    responses: ContractBuilder.buildPostResponses(GameAccountWithStatsSchema),
    summary: 'Link a game account (validates the username with the provider) and start importing games',
  },
  sync: {
    method: 'POST',
    path: '/game-accounts/:id/sync',
    pathParams: z.object({ id: z.string().uuid() }),
    body: z.object({}).optional(),
    responses: ContractBuilder.buildPatchResponses(GameAccountWithStatsSchema),
    summary: 'Start an import of new games for this account (no-op if a sync is already active)',
  },
  delete: {
    method: 'DELETE',
    path: '/game-accounts/:id',
    pathParams: z.object({ id: z.string().uuid() }),
    responses: ContractBuilder.buildDeleteResponses(),
    summary: 'Unlink a game account and delete its imported games',
  },
})
