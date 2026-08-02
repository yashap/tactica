import { InputValidationError } from '@tactica/errors'
import { type Cursor, type Pagination, type ParseOrdering } from '@tactica/pagination'
import { and, asc, count, desc, eq, gt, inArray, lt, or, type SQL } from 'drizzle-orm'
import { type Db } from '../../db/client.js'
import { gameTable, type GameRow, type NewGameRow } from '../../db/schema.js'

export type GameOrderBy = 'createdAt' | 'playedAt'

/** Validates cursor/query ordering params for the games list (used with `parsePagination`). */
export const parseGameOrdering: ParseOrdering<GameOrderBy, Date> = ({ orderBy, lastOrderValueSeen }) => {
  if (orderBy !== 'createdAt' && orderBy !== 'playedAt') {
    throw new InputValidationError(`Cannot order games by '${String(orderBy)}'`)
  }
  const parsedValue = new Date(String(lastOrderValueSeen))
  if (Number.isNaN(parsedValue.getTime())) {
    throw new InputValidationError('Invalid cursor ordering value')
  }
  return { orderBy, lastOrderValueSeen: parsedValue }
}

export class GameRepository {
  public constructor(private readonly db: Db) {}

  /**
   * Insert games, silently skipping any already imported (unique on userId/source/externalGameId).
   * Returns the number actually inserted.
   */
  public async insertMany(rows: NewGameRow[]): Promise<number> {
    if (rows.length === 0) return 0
    const inserted = await this.db
      .insert(gameTable)
      .values(rows)
      .onConflictDoNothing({ target: [gameTable.userId, gameTable.source, gameTable.externalGameId] })
      .returning({ id: gameTable.id })
    return inserted.length
  }

  /**
   * Which of `externalGameIds` are already imported for this user + source. Lets importers skip
   * work (PGN parsing, sending multi-KB rows to Postgres) for games they already have — providers
   * like chess.com only serve whole monthly archives, so every sync re-fetches games we've seen.
   * Hits the same unique index that dedupes inserts, so it stays an exact answer, not a heuristic.
   */
  public async findExistingExternalGameIds(
    userId: string,
    source: GameRow['source'],
    externalGameIds: string[],
  ): Promise<Set<string>> {
    if (externalGameIds.length === 0) return new Set()
    const rows = await this.db
      .select({ externalGameId: gameTable.externalGameId })
      .from(gameTable)
      .where(
        and(
          eq(gameTable.userId, userId),
          eq(gameTable.source, source),
          inArray(gameTable.externalGameId, externalGameIds),
        ),
      )
    return new Set(rows.map((row) => row.externalGameId))
  }

  public async findById(userId: string, id: string): Promise<GameRow | undefined> {
    const rows = await this.db
      .select()
      .from(gameTable)
      .where(and(eq(gameTable.userId, userId), eq(gameTable.id, id)))
      .limit(1)
    return rows[0]
  }

  public async list(
    userId: string,
    pagination: Pagination<GameOrderBy> | Cursor<GameOrderBy, Date>,
  ): Promise<GameRow[]> {
    const orderColumn = pagination.orderBy === 'playedAt' ? gameTable.playedAt : gameTable.createdAt
    const direction = pagination.orderDirection === 'asc' ? asc : desc
    const conditions: (SQL | undefined)[] = [eq(gameTable.userId, userId)]
    if ('lastIdSeen' in pagination) {
      // Keyset pagination: everything strictly after the last (orderValue, id) pair seen
      const compare = pagination.orderDirection === 'asc' ? gt : lt
      conditions.push(
        or(
          compare(orderColumn, pagination.lastOrderValueSeen),
          and(eq(orderColumn, pagination.lastOrderValueSeen), compare(gameTable.id, pagination.lastIdSeen)),
        ),
      )
    }
    return this.db
      .select()
      .from(gameTable)
      .where(and(...conditions))
      .orderBy(direction(orderColumn), direction(gameTable.id))
      .limit(pagination.limit)
  }

  public async countByGameAccount(userId: string, gameAccountId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(gameTable)
      .where(and(eq(gameTable.userId, userId), eq(gameTable.gameAccountId, gameAccountId)))
    return row?.value ?? 0
  }
}
