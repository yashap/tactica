import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ChessComClient } from './ChessComClient.js'

/**
 * Exercises the client against a local HTTP server that mimics chess.com's public API, including
 * its rate-limiting behavior.
 */
describe('ChessComClient', () => {
  let server: Server
  let client: ChessComClient
  let requestCount429 = 0

  beforeAll(async () => {
    server = createServer((req, res) => {
      const respond = (status: number, body?: unknown): void => {
        res.writeHead(status, { 'Content-Type': 'application/json' })
        res.end(body === undefined ? undefined : JSON.stringify(body))
      }
      switch (req.url) {
        case '/player/realuser':
          return respond(200, { username: 'realuser' })
        case '/player/ghost':
          return respond(404, { code: 0, message: 'User not found' })
        case '/player/realuser/games/archives':
          return respond(200, {
            archives: [
              'https://api.chess.com/pub/player/realuser/games/2024/01',
              'https://api.chess.com/pub/player/realuser/games/2024/02',
              'not-an-archive-url',
            ],
          })
        case '/player/realuser/games/2024/01':
          return respond(200, { games: [{ uuid: 'abc' }] })
        case '/player/flaky/games/2024/01': {
          // First request is rate-limited, the retry succeeds
          requestCount429++
          if (requestCount429 === 1) {
            res.writeHead(429, { 'Retry-After': '0' })
            return res.end()
          }
          return respond(200, { games: [{ uuid: 'after-retry' }] })
        }
        default:
          return respond(500, { message: `Unexpected test request: ${req.url}` })
      }
    })
    await new Promise<void>((resolve) => server.listen(0, resolve))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Failed to bind test server')
    client = new ChessComClient({
      apiUrl: `http://127.0.0.1:${address.port}`,
      userAgent: 'Tactica tests',
      retryBaseDelayMs: 5,
    })
  })

  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())))
  })

  it('reports whether a player exists', async () => {
    expect(await client.playerExists('RealUser')).toBe(true)
    expect(await client.playerExists('ghost')).toBe(false)
  })

  it('parses archive URLs into YYYY-MM month keys, skipping unrecognized ones', async () => {
    expect(await client.listArchiveMonths('realuser')).toEqual(['2024-01', '2024-02'])
  })

  it('fetches monthly games', async () => {
    const games = await client.getMonthlyGames('realuser', '2024-01')
    expect(games).toEqual([{ uuid: 'abc' }])
  })

  it('retries after a 429 response', async () => {
    const games = await client.getMonthlyGames('flaky', '2024-01')
    expect(games).toEqual([{ uuid: 'after-retry' }])
    expect(requestCount429).toBe(2)
  })

  it('throws on unexpected server errors', async () => {
    await expect(client.getMonthlyGames('realuser', '2030-12')).rejects.toThrow(/chess.com API request failed: 500/)
  })
})
