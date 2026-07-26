import { standardFields } from '@tactica/drizzle-utils'
import { index, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const gameSourceEnum = pgEnum('GameSource', ['chesscom', 'lichess'])
export const chessColorEnum = pgEnum('ChessColor', ['w', 'b'])
/** Result from the account owner's perspective. */
export const gameResultEnum = pgEnum('GameResult', ['win', 'loss', 'draw'])
export const gameAnalysisStatusEnum = pgEnum('GameAnalysisStatus', ['pending', 'analyzing', 'analyzed', 'failed'])

/** A user's linked account on an external chess platform (at most one per source per user). */
export const gameAccountTable = pgTable(
  'GameAccount',
  {
    ...standardFields,
    userId: uuid('userId').notNull(),
    source: gameSourceEnum('source').notNull(),
    externalUsername: text('externalUsername').notNull(),
    /**
     * Source-specific incremental sync marker. For chess.com: the most recent fully-imported
     * *completed* calendar month, as 'YYYY-MM' — the current (incomplete) month is always
     * re-fetched and deduped via the Game unique index.
     */
    syncCheckpoint: text('syncCheckpoint'),
    /** The pg-boss job id of the most recently enqueued import, used to derive `syncActive`. */
    lastSyncJobId: text('lastSyncJobId'),
    lastSyncedAt: timestamp('lastSyncedAt', { precision: 3, withTimezone: true }),
  },
  (table) => [
    index('GameAccount_userId_idx').on(table.userId),
    uniqueIndex('GameAccount_userId_source_key').on(table.userId, table.source),
  ],
)

export type GameAccountRow = typeof gameAccountTable.$inferSelect
export type NewGameAccountRow = typeof gameAccountTable.$inferInsert

/** An imported game. The raw PGN is the source of truth; header fields are denormalized for list UIs. */
export const gameTable = pgTable(
  'Game',
  {
    ...standardFields,
    userId: uuid('userId').notNull(),
    gameAccountId: uuid('gameAccountId')
      .notNull()
      .references(() => gameAccountTable.id, { onDelete: 'cascade' }),
    source: gameSourceEnum('source').notNull(),
    /** The provider's stable id for the game (chess.com: game `uuid`, falling back to `url`). */
    externalGameId: text('externalGameId').notNull(),
    pgn: text('pgn').notNull(),
    playedAt: timestamp('playedAt', { precision: 3, withTimezone: true }).notNull(),
    timeControl: text('timeControl').notNull(),
    userColor: chessColorEnum('userColor').notNull(),
    opponentUsername: text('opponentUsername').notNull(),
    result: gameResultEnum('result').notNull(),
    analysisStatus: gameAnalysisStatusEnum('analysisStatus').notNull().default('pending'),
  },
  (table) => [
    index('Game_userId_idx').on(table.userId),
    index('Game_gameAccountId_idx').on(table.gameAccountId),
    // Makes re-imports idempotent: importers insert with onConflictDoNothing on this index
    uniqueIndex('Game_userId_source_externalGameId_key').on(table.userId, table.source, table.externalGameId),
    // The default list ordering (newest played first)
    index('Game_userId_playedAt_idx').on(table.userId, table.playedAt),
  ],
)

export type GameRow = typeof gameTable.$inferSelect
export type NewGameRow = typeof gameTable.$inferInsert
