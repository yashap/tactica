import { type GameResult } from '@tactica/tactica-core-contract'
import { getLogger } from '@tactica/logging'
import { type ChessComApi, type ChessComGame } from './ChessComClient.js'
import { type ExternalGame, type FetchGamesOptions, type GameBatch, type GameSource } from './GameSource.js'

// chess.com per-player result codes that mean the game was drawn; 'win' means win, anything else
// (checkmated, resigned, timeout, abandoned, ...) is a loss
const DRAW_RESULT_CODES: ReadonlySet<string> = new Set([
  'agreed',
  'repetition',
  'stalemate',
  'insufficient',
  '50move',
  'timevsinsufficient',
])

const toGameResult = (playerResultCode: string): GameResult => {
  if (playerResultCode === 'win') return 'win'
  return DRAW_RESULT_CODES.has(playerResultCode) ? 'draw' : 'loss'
}

/** The current calendar month as a 'YYYY-MM' key (months before this can never gain games). */
const currentMonthKey = (now: Date): string =>
  `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`

export class ChessComGameSource implements GameSource {
  public readonly source = 'chesscom' as const

  public constructor(private readonly client: ChessComApi) {}

  public async validateUsername(username: string): Promise<boolean> {
    return this.client.playerExists(username)
  }

  public async *fetchGames(username: string, options: FetchGamesOptions): AsyncIterable<GameBatch> {
    const allMonths = await this.client.listArchiveMonths(username)
    // 'YYYY-MM' keys compare correctly as strings. The current month is never "complete", so it
    // always sorts after any checkpoint we could have stored.
    const targetMonths = allMonths
      .filter((month) => !options.sinceCheckpoint || month > options.sinceCheckpoint)
      .slice(-options.maxBatches)
      .reverse() // newest first
    const thisMonth = currentMonthKey(new Date())
    for (const month of targetMonths) {
      const games = await this.client.getMonthlyGames(username, month)
      yield {
        batchKey: month,
        isComplete: month < thisMonth,
        games: games.flatMap((game) => this.toExternalGame(username, game)),
      }
    }
  }

  /** Normalize a chess.com game, or skip it (returning []) when it's a variant or malformed. */
  private toExternalGame(username: string, game: ChessComGame): ExternalGame[] {
    const externalId = game.uuid ?? game.url
    if (!externalId) {
      getLogger().warn('Skipping chess.com game with no uuid or url')
      return []
    }
    const skip = (reason: string): [] => {
      getLogger().warn(`Skipping chess.com game: ${reason}`, { externalId })
      return []
    }
    // Variants (chess960, bughouse, ...) have different rules; the analysis pipeline assumes
    // standard chess
    if (game.rules !== 'chess') return skip(`unsupported rules '${game.rules ?? 'unknown'}'`)
    if (!game.pgn) return skip('no PGN')
    if (!game.white || !game.black || !game.end_time) return skip('missing players or end_time')
    const lowerUsername = username.toLowerCase()
    let userSide: ChessComGamePlayerSide
    if (game.white.username.toLowerCase() === lowerUsername) {
      userSide = { userColor: 'w', user: game.white, opponent: game.black }
    } else if (game.black.username.toLowerCase() === lowerUsername) {
      userSide = { userColor: 'b', user: game.black, opponent: game.white }
    } else {
      return skip('account user is not a player in this game')
    }
    return [
      {
        externalId,
        pgn: game.pgn,
        playedAt: new Date(game.end_time * 1000),
        timeControl: game.time_control ?? 'unknown',
        userColor: userSide.userColor,
        opponentUsername: userSide.opponent.username,
        result: toGameResult(userSide.user.result),
      },
    ]
  }
}

interface ChessComGamePlayerSide {
  userColor: 'w' | 'b'
  user: { username: string; result: string }
  opponent: { username: string; result: string }
}
