import { getLogger } from '@tactica/logging'
import { Chess } from 'chess.js'
import { type GameAccountRepository } from '../domain/gameAccount/GameAccountRepository.js'
import { type GameRepository } from '../domain/game/GameRepository.js'
import { type ExternalGame, type GameSourceRegistry } from '../domain/gameSource/GameSource.js'
import { type NewGameRow } from '../db/schema.js'
import { type ImportGamesPayload } from './jobQueue.js'

export interface ImportGamesJobDeps {
  gameAccountRepository: GameAccountRepository
  gameRepository: GameRepository
  gameSources: GameSourceRegistry
  /** Cap on monthly archives fetched per run (newest win). */
  maxMonths: number
}

const isParseablePgn = (pgn: string): boolean => {
  try {
    new Chess().loadPgn(pgn)
    return true
  } catch {
    return false
  }
}

/**
 * The `import-games` job: fetch new games for a linked account and persist them. Idempotent — the
 * Game unique index dedupes re-imported games, so a retried or re-run job just fills in gaps.
 * Batches arrive newest-first; the account's checkpoint only advances after the whole run
 * succeeds, so a mid-run failure means the next attempt re-fetches (cheaply) rather than skips.
 */
export const buildImportGamesJob =
  (deps: ImportGamesJobDeps) =>
  async (payload: ImportGamesPayload): Promise<void> => {
    const logger = getLogger()
    const account = await deps.gameAccountRepository.findById(payload.userId, payload.gameAccountId)
    if (!account) {
      logger.warn('Skipping import for deleted game account', { gameAccountId: payload.gameAccountId })
      return
    }
    const source = deps.gameSources[account.source]
    if (!source) {
      logger.error('No game source registered for account, skipping import', { source: account.source })
      return
    }

    let totalInserted = 0
    let newestCompleteBatch: string | undefined
    const batches = source.fetchGames(account.externalUsername, {
      sinceCheckpoint: account.syncCheckpoint ?? undefined,
      maxBatches: deps.maxMonths,
    })
    for await (const batch of batches) {
      // Providers only serve coarse batches (chess.com: a whole month), so every sync re-fetches
      // games we already have. Drop those up front — the unique index would reject them anyway,
      // but this avoids PGN-parsing and shipping multi-KB rows to Postgres for nothing.
      const alreadyImported = await deps.gameRepository.findExistingExternalGameIds(
        account.userId,
        account.source,
        batch.games.map((game) => game.externalId),
      )
      const newGames = batch.games.filter((game) => !alreadyImported.has(game.externalId))
      const rows = newGames.flatMap((game): NewGameRow[] => {
        if (!isParseablePgn(game.pgn)) {
          logger.warn('Skipping game with unparseable PGN', { externalGameId: game.externalId })
          return []
        }
        return [toNewGameRow(account.userId, account.id, account.source, game)]
      })
      const inserted = await deps.gameRepository.insertMany(rows)
      totalInserted += inserted
      if (batch.isComplete && (!newestCompleteBatch || batch.batchKey > newestCompleteBatch)) {
        newestCompleteBatch = batch.batchKey
      }
      logger.info('Imported game batch', {
        batchKey: batch.batchKey,
        fetched: batch.games.length,
        alreadyImported: alreadyImported.size,
        inserted,
      })
    }

    await deps.gameAccountRepository.recordSyncCompleted(payload.userId, account.id, newestCompleteBatch)
    logger.info('Import complete', { gameAccountId: account.id, totalInserted })
  }

const toNewGameRow = (
  userId: string,
  gameAccountId: string,
  source: NewGameRow['source'],
  game: ExternalGame,
): NewGameRow => ({
  userId,
  gameAccountId,
  source,
  externalGameId: game.externalId,
  pgn: game.pgn,
  playedAt: game.playedAt,
  timeControl: game.timeControl,
  userColor: game.userColor,
  opponentUsername: game.opponentUsername,
  result: game.result,
})
