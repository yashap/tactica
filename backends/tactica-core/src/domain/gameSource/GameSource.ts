import { type ChessColor, type GameResult, type GameSource as GameSourceName } from '@tactica/tactica-core-contract'

/** A game fetched from an external platform, normalized to what we persist. */
export interface ExternalGame {
  /** The provider's stable id for the game. */
  externalId: string
  pgn: string
  playedAt: Date
  timeControl: string
  userColor: ChessColor
  opponentUsername: string
  result: GameResult
}

export interface GameBatch {
  /** Source-specific checkpoint key for this batch (chess.com: a 'YYYY-MM' month). */
  batchKey: string
  /** True when this batch can never gain more games (e.g. a fully completed past month). */
  isComplete: boolean
  games: ExternalGame[]
}

export interface FetchGamesOptions {
  /** Only fetch batches strictly after this checkpoint (a previously returned complete batchKey). */
  sinceCheckpoint?: string
  /** Cap on how many batches to fetch. When more are available, the newest ones win. */
  maxBatches: number
}

/**
 * A platform we can import a user's games from. Implementations must fetch serially (one request
 * at a time) and be polite to the provider's API. Batches are yielded newest-first so fresh games
 * are available as soon as possible.
 */
export interface GameSource {
  readonly source: GameSourceName
  validateUsername(username: string): Promise<boolean>
  fetchGames(username: string, options: FetchGamesOptions): AsyncIterable<GameBatch>
}

/** The sources actually available in this deployment (lichess arrives in a later milestone). */
export type GameSourceRegistry = Partial<Record<GameSourceName, GameSource>>

export const buildGameSourceRegistry = (sources: GameSource[]): GameSourceRegistry => {
  const registry: GameSourceRegistry = {}
  for (const source of sources) {
    registry[source.source] = source
  }
  return registry
}
