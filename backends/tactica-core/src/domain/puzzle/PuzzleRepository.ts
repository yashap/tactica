import { InputValidationError } from '@tactica/errors'
import { type Cursor, type Pagination, type ParseOrdering } from '@tactica/pagination'
import { and, asc, count, desc, eq, gt, lt, or, type SQL } from 'drizzle-orm'
import { type Db } from '../../db/client.js'
import { gameTable, type NewPuzzleRow, type PuzzleRow, puzzleTable } from '../../db/schema.js'

export type PuzzleOrderBy = 'createdAt' | 'playedAt'

/** The puzzle plus the bits of game context the puzzle screen shows, fetched in one query. */
export interface PuzzleWithGame extends PuzzleRow {
  opponentUsername: string
  playedAt: Date
}

export const parsePuzzleOrdering: ParseOrdering<PuzzleOrderBy, Date> = ({ orderBy, lastOrderValueSeen }) => {
  if (orderBy !== 'createdAt' && orderBy !== 'playedAt') {
    throw new InputValidationError(`Cannot order puzzles by '${String(orderBy)}'`)
  }
  const parsedValue = new Date(String(lastOrderValueSeen))
  if (Number.isNaN(parsedValue.getTime())) {
    throw new InputValidationError('Invalid cursor ordering value')
  }
  return { orderBy, lastOrderValueSeen: parsedValue }
}

export class PuzzleRepository {
  public constructor(private readonly db: Db) {}

  /**
   * Insert puzzles, skipping any this game already has. Re-analysing a game is expected — pg-boss
   * retries, and a game can be re-submitted — so this has to be idempotent.
   */
  public async insertMany(rows: NewPuzzleRow[]): Promise<number> {
    if (rows.length === 0) return 0
    const inserted = await this.db
      .insert(puzzleTable)
      .values(rows)
      .onConflictDoNothing({ target: [puzzleTable.gameId, puzzleTable.ply] })
      .returning({ id: puzzleTable.id })
    return inserted.length
  }

  public async findById(userId: string, id: string): Promise<PuzzleWithGame | undefined> {
    const rows = await this.selectWithGame()
      .where(and(eq(puzzleTable.userId, userId), eq(puzzleTable.id, id)))
      .limit(1)
    return rows[0]
  }

  public async list(
    userId: string,
    pagination: Pagination<PuzzleOrderBy> | Cursor<PuzzleOrderBy, Date>,
  ): Promise<PuzzleWithGame[]> {
    const orderColumn = pagination.orderBy === 'playedAt' ? gameTable.playedAt : puzzleTable.createdAt
    const direction = pagination.orderDirection === 'asc' ? asc : desc
    const conditions: (SQL | undefined)[] = [eq(puzzleTable.userId, userId)]
    if ('lastIdSeen' in pagination) {
      const compare = pagination.orderDirection === 'asc' ? gt : lt
      conditions.push(
        or(
          compare(orderColumn, pagination.lastOrderValueSeen),
          and(eq(orderColumn, pagination.lastOrderValueSeen), compare(puzzleTable.id, pagination.lastIdSeen)),
        ),
      )
    }
    return this.selectWithGame()
      .where(and(...conditions))
      .orderBy(direction(orderColumn), direction(puzzleTable.id))
      .limit(pagination.limit)
  }

  public async countByGameAccount(userId: string, gameAccountId: string): Promise<number> {
    const [row] = await this.db
      .select({ value: count() })
      .from(puzzleTable)
      .innerJoin(gameTable, eq(puzzleTable.gameId, gameTable.id))
      .where(and(eq(puzzleTable.userId, userId), eq(gameTable.gameAccountId, gameAccountId)))
    return row?.value ?? 0
  }

  private selectWithGame() {
    return this.db
      .select({
        id: puzzleTable.id,
        createdAt: puzzleTable.createdAt,
        updatedAt: puzzleTable.updatedAt,
        userId: puzzleTable.userId,
        gameId: puzzleTable.gameId,
        ply: puzzleTable.ply,
        fen: puzzleTable.fen,
        playerColor: puzzleTable.playerColor,
        playedMoveUci: puzzleTable.playedMoveUci,
        playedMoveSan: puzzleTable.playedMoveSan,
        bestMoveUci: puzzleTable.bestMoveUci,
        bestMoveSan: puzzleTable.bestMoveSan,
        acceptableMovesUci: puzzleTable.acceptableMovesUci,
        engineLines: puzzleTable.engineLines,
        evalBefore: puzzleTable.evalBefore,
        evalAfter: puzzleTable.evalAfter,
        winProbBefore: puzzleTable.winProbBefore,
        winProbAfter: puzzleTable.winProbAfter,
        severity: puzzleTable.severity,
        opponentUsername: gameTable.opponentUsername,
        playedAt: gameTable.playedAt,
      })
      .from(puzzleTable)
      .innerJoin(gameTable, eq(puzzleTable.gameId, gameTable.id))
  }
}
