import { InternalServerError } from '@tactica/errors'
import { getLogger } from '@tactica/logging'

export interface ChessComGamePlayer {
  username: string
  result: string
}

/** The subset of chess.com's monthly-archive game shape that we consume. */
export interface ChessComGame {
  uuid?: string
  url?: string
  pgn?: string
  time_control?: string
  end_time?: number
  rules?: string
  white?: ChessComGamePlayer
  black?: ChessComGamePlayer
}

interface ChessComArchivesResponse {
  archives?: string[]
}

interface ChessComMonthlyArchiveResponse {
  games?: ChessComGame[]
}

/** The surface {@link ChessComGameSource} consumes — an interface so tests can stub it. */
export interface ChessComApi {
  playerExists(username: string): Promise<boolean>
  listArchiveMonths(username: string): Promise<string[]>
  getMonthlyGames(username: string, month: string): Promise<ChessComGame[]>
}

const MAX_RETRIES = 3

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Minimal client for chess.com's public (unauthenticated) data API. Callers must make requests
 * serially — chess.com rate-limits parallel requests — which our usage does naturally by awaiting
 * every call. 429s are retried with backoff, honoring Retry-After when present.
 */
export class ChessComClient implements ChessComApi {
  public constructor(private readonly options: { apiUrl: string; userAgent: string; retryBaseDelayMs?: number }) {}

  public async playerExists(username: string): Promise<boolean> {
    const response = await this.request(`/player/${encodeURIComponent(username.toLowerCase())}`)
    if (response.status === 404) return false
    this.assertOk(response)
    return true
  }

  /** All months a player has games for, as 'YYYY-MM' keys in chronological order. */
  public async listArchiveMonths(username: string): Promise<string[]> {
    const response = await this.request(`/player/${encodeURIComponent(username.toLowerCase())}/games/archives`)
    this.assertOk(response)
    const body = (await response.json()) as ChessComArchivesResponse
    return (body.archives ?? []).flatMap((url) => {
      // Archive URLs end in .../games/{YYYY}/{MM}
      const match = /\/games\/(\d{4})\/(\d{2})$/.exec(url)
      if (!match) {
        getLogger().warn('Unrecognized chess.com archive URL, skipping', { url })
        return []
      }
      return [`${match[1]}-${match[2]}`]
    })
  }

  /** All of a player's games for a given 'YYYY-MM' month. */
  public async getMonthlyGames(username: string, month: string): Promise<ChessComGame[]> {
    const [year, monthOfYear] = month.split('-')
    const response = await this.request(
      `/player/${encodeURIComponent(username.toLowerCase())}/games/${year}/${monthOfYear}`,
    )
    this.assertOk(response)
    const body = (await response.json()) as ChessComMonthlyArchiveResponse
    return body.games ?? []
  }

  private async request(path: string): Promise<Response> {
    const url = `${this.options.apiUrl}${path}`
    for (let attempt = 0; ; attempt++) {
      const response = await fetch(url, { headers: { 'User-Agent': this.options.userAgent } })
      if (response.status !== 429 || attempt >= MAX_RETRIES) return response
      const retryAfterSeconds = Number(response.headers.get('retry-after'))
      const baseDelayMs = this.options.retryBaseDelayMs ?? 1000
      const delayMs = retryAfterSeconds > 0 ? retryAfterSeconds * 1000 : baseDelayMs * 2 ** attempt
      getLogger().warn('chess.com rate limited us, backing off', { url, delayMs, attempt })
      await sleep(delayMs)
    }
  }

  private assertOk(response: Response): void {
    if (!response.ok) {
      throw new InternalServerError(`chess.com API request failed: ${response.status} ${response.url}`)
    }
  }
}
