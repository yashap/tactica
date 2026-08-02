import { readFileSync } from 'node:fs'
import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { type ChessComApi, type ChessComGame } from './ChessComClient.js'
import { ChessComGameSource } from './ChessComGameSource.js'
import { type GameBatch } from './GameSource.js'

const fixturePath = new URL('../../test/fixtures/chesscom/erik-2026-06.json', import.meta.url).pathname
const fixtureGames = (JSON.parse(readFileSync(fixturePath, 'utf-8')) as { games: ChessComGame[] }).games

const VALID_PGN = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1/2-1/2'

const buildGame = (overrides: Partial<ChessComGame>): ChessComGame => ({
  uuid: crypto.randomUUID(),
  url: 'https://www.chess.com/game/live/123',
  pgn: VALID_PGN,
  time_control: '600',
  end_time: 1750000000,
  rules: 'chess',
  white: { username: 'testuser', result: 'win' },
  black: { username: 'opponent', result: 'checkmated' },
  ...overrides,
})

const stubClient = (monthlyGames: Record<string, ChessComGame[]>, playerExists = true): ChessComApi => ({
  playerExists: () => Promise.resolve(playerExists),
  listArchiveMonths: () => Promise.resolve(Object.keys(monthlyGames).sort()),
  getMonthlyGames: (_username, month) => Promise.resolve(monthlyGames[month] ?? []),
})

const collect = async (iterable: AsyncIterable<GameBatch>): Promise<GameBatch[]> => {
  const batches: GameBatch[] = []
  for await (const batch of iterable) batches.push(batch)
  return batches
}

describe('ChessComGameSource', () => {
  it('maps a game where the user played white and won', async () => {
    const source = new ChessComGameSource(stubClient({ '2020-01': [buildGame({})] }))
    const [batch] = await collect(source.fetchGames('TestUser', { maxBatches: 10 }))
    expect(batch!.games).toHaveLength(1)
    const game = batch!.games[0]!
    expect(game.userColor).toBe('white')
    expect(game.result).toBe('win')
    expect(game.opponentUsername).toBe('opponent')
    expect(game.playedAt).toEqual(new Date(1750000000 * 1000))
  })

  it('maps a game where the user played black and drew, matching username case-insensitively', async () => {
    const game = buildGame({
      white: { username: 'opponent', result: 'stalemate' },
      black: { username: 'TESTUSER', result: 'stalemate' },
    })
    const source = new ChessComGameSource(stubClient({ '2020-01': [game] }))
    const [batch] = await collect(source.fetchGames('testuser', { maxBatches: 10 }))
    expect(batch!.games[0]!.userColor).toBe('black')
    expect(batch!.games[0]!.result).toBe('draw')
  })

  it('maps timeouts and resignations to losses', async () => {
    const games = [
      buildGame({ white: { username: 'testuser', result: 'timeout' }, black: { username: 'o', result: 'win' } }),
      buildGame({ white: { username: 'testuser', result: 'resigned' }, black: { username: 'o', result: 'win' } }),
    ]
    const source = new ChessComGameSource(stubClient({ '2020-01': games }))
    const [batch] = await collect(source.fetchGames('testuser', { maxBatches: 10 }))
    expect(batch!.games.map((g) => g.result)).toEqual(['loss', 'loss'])
  })

  it('skips variants, games without PGNs, and games the user is not a player in', async () => {
    const games = [
      buildGame({ rules: 'chess960' }),
      buildGame({ pgn: undefined }),
      buildGame({ white: { username: 'someone', result: 'win' }, black: { username: 'else', result: 'checkmated' } }),
      buildGame({}),
    ]
    const source = new ChessComGameSource(stubClient({ '2020-01': games }))
    const [batch] = await collect(source.fetchGames('testuser', { maxBatches: 10 }))
    expect(batch!.games).toHaveLength(1)
  })

  it('falls back to the game url when there is no uuid', async () => {
    const game = buildGame({ uuid: undefined, url: 'https://www.chess.com/game/live/42' })
    const source = new ChessComGameSource(stubClient({ '2020-01': [game] }))
    const [batch] = await collect(source.fetchGames('testuser', { maxBatches: 10 }))
    expect(batch!.games[0]!.externalId).toBe('https://www.chess.com/game/live/42')
  })

  it('yields batches newest-first, filtered by checkpoint and capped by maxBatches', async () => {
    const months = {
      '2019-11': [buildGame({})],
      '2019-12': [buildGame({})],
      '2020-01': [buildGame({})],
      '2020-02': [buildGame({})],
    }
    const source = new ChessComGameSource(stubClient(months))

    const all = await collect(source.fetchGames('testuser', { maxBatches: 10 }))
    expect(all.map((b) => b.batchKey)).toEqual(['2020-02', '2020-01', '2019-12', '2019-11'])
    // These months are long past, so every batch is complete
    expect(all.every((b) => b.isComplete)).toBe(true)

    const afterCheckpoint = await collect(source.fetchGames('testuser', { sinceCheckpoint: '2019-12', maxBatches: 10 }))
    expect(afterCheckpoint.map((b) => b.batchKey)).toEqual(['2020-02', '2020-01'])

    const capped = await collect(source.fetchGames('testuser', { maxBatches: 2 }))
    expect(capped.map((b) => b.batchKey)).toEqual(['2020-02', '2020-01'])
  })

  it('marks the current month as incomplete', async () => {
    const now = new Date()
    const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
    const source = new ChessComGameSource(stubClient({ [thisMonth]: [buildGame({})] }))
    const [batch] = await collect(source.fetchGames('testuser', { maxBatches: 10 }))
    expect(batch!.isComplete).toBe(false)
  })

  it('normalizes real recorded chess.com games (PGNs with %clk comments parse)', async () => {
    const source = new ChessComGameSource(stubClient({ '2026-06': fixtureGames }))
    const [batch] = await collect(source.fetchGames('erik', { maxBatches: 10 }))
    expect(batch!.games.length).toBeGreaterThanOrEqual(3)
    for (const game of batch!.games) {
      expect(game.externalId).toBeTruthy()
      expect(game.opponentUsername.toLowerCase()).not.toBe('erik')
      expect(['win', 'loss', 'draw']).toContain(game.result)
      // The real payoff: chess.js must handle chess.com's PGN quirks ({[%clk ...]} comments etc.)
      expect(() => new Chess().loadPgn(game.pgn)).not.toThrow()
    }
  })
})
