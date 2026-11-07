import { standardFields } from '@tactica/drizzle-utils'
import { type AnalysisResult, type AnalysisSettings } from '@tactica/tactica-analysis-contract'
import { index, jsonb, pgEnum, pgTable, text } from 'drizzle-orm/pg-core'

export const analysisStatusEnum = pgEnum('AnalysisStatus', ['queued', 'running', 'succeeded', 'failed'])
export const chessColorEnum = pgEnum('ChessColor', ['white', 'black'])

/**
 * One submitted game analysis.
 *
 * Deliberately has **no `userId`**: this is an internal service that analyses a PGN handed to it and
 * knows nothing about accounts. tactica-core owns all user data and scoping, and does the
 * per-user authorization before it ever calls here.
 */
export const analysisTable = pgTable(
  'Analysis',
  {
    ...standardFields,
    status: analysisStatusEnum('status').notNull().default('queued'),
    pgn: text('pgn').notNull(),
    /** Whose mistakes we're looking for. */
    playerColor: chessColorEnum('playerColor').notNull(),
    /** Per-request search-budget overrides, if the caller supplied any. */
    settings: jsonb('settings').$type<AnalysisSettings>(),
    /** Populated once `status` is `succeeded`. */
    result: jsonb('result').$type<AnalysisResult>(),
    /** Populated once `status` is `failed`. */
    error: text('error'),
  },
  (table) => [index('Analysis_status_idx').on(table.status)],
)

export type AnalysisRow = typeof analysisTable.$inferSelect
export type NewAnalysisRow = typeof analysisTable.$inferInsert
