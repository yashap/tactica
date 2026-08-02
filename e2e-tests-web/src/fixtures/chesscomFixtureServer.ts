import { readFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'

/**
 * A stand-in for chess.com's public API so e2e runs (especially CI) never hit the real thing.
 * Serves one player, 'erik', with a single month of real recorded games. Point tactica-core at it
 * via CHESSCOM_API_URL (see .github/workflows/ci.yml); without that env var the backend talks to
 * real chess.com, which also works for local runs.
 */

const FIXTURE_MONTH = '2026/06'
const gamesJson = readFileSync(new URL('./data/erik-games.json', import.meta.url), 'utf-8')

export const CHESSCOM_FIXTURE_PORT = 4599
export const FIXTURE_PLAYER = 'erik'
/** How many standard-rules games with PGNs the fixture serves (what an import should persist). */
export const FIXTURE_GAME_COUNT = (JSON.parse(gamesJson) as { games: unknown[] }).games.length

export const startChessComFixtureServer = async (port = CHESSCOM_FIXTURE_PORT): Promise<Server> => {
  const server = createServer((req, res) => {
    const respondJson = (status: number, body: string): void => {
      res.writeHead(status, { 'Content-Type': 'application/json' })
      res.end(body)
    }
    const url = req.url ?? ''
    if (url === `/player/${FIXTURE_PLAYER}`) {
      return respondJson(200, JSON.stringify({ username: FIXTURE_PLAYER }))
    }
    if (url === `/player/${FIXTURE_PLAYER}/games/archives`) {
      return respondJson(
        200,
        JSON.stringify({
          archives: [`https://api.chess.com/pub/player/${FIXTURE_PLAYER}/games/${FIXTURE_MONTH}`],
        }),
      )
    }
    if (url === `/player/${FIXTURE_PLAYER}/games/${FIXTURE_MONTH}`) {
      return respondJson(200, gamesJson)
    }
    // Any other player (or path) doesn't exist — same shape chess.com uses
    return respondJson(404, JSON.stringify({ code: 0, message: 'Not found' }))
  })
  await new Promise<void>((resolve) => server.listen(port, resolve))
  return server
}
