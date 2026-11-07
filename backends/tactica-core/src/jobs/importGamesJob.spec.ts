import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db, sql } from '../db/client.js'
import { gameAccountTable, type GameAccountRow } from '../db/schema.js'
import { GameAccountRepository } from '../domain/gameAccount/GameAccountRepository.js'
import { GameRepository } from '../domain/game/GameRepository.js'
import {
  buildGameSourceRegistry,
  type ExternalGame,
  type GameBatch,
  type GameSource,
} from '../domain/gameSource/GameSource.js'
import { buildImportGamesJob } from './importGamesJob.js'

const VALID_PGN = '1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 1/2-1/2'

const externalGame = (externalId: string, overrides: Partial<ExternalGame> = {}): ExternalGame => ({
  externalId,
  pgn: VALID_PGN,
  playedAt: new Date('2024-01-15T12:00:00Z'),
  timeControl: '600',
  userColor: 'white',
  opponentUsername: 'opponent',
  result: 'win',
  ...overrides,
})

/** A GameSource that serves canned batches and records the fetch options it was called with. */
class FakeGameSource implements GameSource {
  public readonly source = 'chesscom' as const
  public lastFetchOptions: { sinceCheckpoint?: string; maxBatches: number } | undefined

  public constructor(private readonly batches: GameBatch[]) {}

  public validateUsername(): Promise<boolean> {
    return Promise.resolve(true)
  }

  public async *fetchGames(
    _username: string,
    options: { sinceCheckpoint?: string; maxBatches: number },
  ): AsyncIterable<GameBatch> {
    this.lastFetchOptions = options
    for (const batch of this.batches) {
      yield batch
    }
  }
}

describe('importGamesJob (integration)', () => {
  const gameAccountRepository = new GameAccountRepository(db)
  const gameRepository = new GameRepository(db)
  let userId: string
  let account: GameAccountRow
  /** Games handed to analysis by the most recent run. */
  let analysisQueue: { gameId: string; userId: string }[]

  const runJob = async (batches: GameBatch[], maxMonths = 3): Promise<FakeGameSource> => {
    const source = new FakeGameSource(batches)
    const job = buildImportGamesJob({
      gameAccountRepository,
      gameRepository,
      gameSources: buildGameSourceRegistry([source]),
      maxMonths,
      enqueueAnalysis: (payload) => {
        analysisQueue.push(payload)
        return Promise.resolve(null)
      },
    })
    await job({ gameAccountId: account.id, userId })
    return source
  }

  beforeEach(async () => {
    await db.delete(gameAccountTable) // cascades to Game
    analysisQueue = []
    userId = crypto.randomUUID()
    account = await gameAccountRepository.create({ userId, source: 'chesscom', externalUsername: 'testuser' })
  })

  afterAll(async () => {
    await sql.end()
  })

  it('imports games and is idempotent across re-runs', async () => {
    const batches: GameBatch[] = [
      { batchKey: '2024-02', isComplete: true, games: [externalGame('g3'), externalGame('g4')] },
      { batchKey: '2024-01', isComplete: true, games: [externalGame('g1'), externalGame('g2')] },
    ]
    await runJob(batches)
    expect(await gameRepository.countByGameAccount(userId, account.id)).toBe(4)

    // Second run sees the same batches (e.g. a retry) — no duplicates
    await runJob(batches)
    expect(await gameRepository.countByGameAccount(userId, account.id)).toBe(4)
  })

  it('filters out games it already has before parsing and inserting them', async () => {
    // The realistic case: the current month is re-fetched every sync, so most of the batch is
    // already imported and only the tail is new.
    const games = [externalGame('g1'), externalGame('g2')]
    await runJob([{ batchKey: '2024-01', isComplete: false, games }])
    expect(await gameRepository.countByGameAccount(userId, account.id)).toBe(2)

    const insertMany = vi.spyOn(gameRepository, 'insertMany')
    await runJob([{ batchKey: '2024-01', isComplete: false, games: [...games, externalGame('g3')] }])

    // Only the genuinely-new game reaches the insert — the other two never get that far
    expect(insertMany).toHaveBeenCalledTimes(1)
    expect(insertMany.mock.calls[0]?.[0]?.map((row) => row.externalGameId)).toEqual(['g3'])
    expect(await gameRepository.countByGameAccount(userId, account.id)).toBe(3)
    insertMany.mockRestore()
  })

  /** The account's games, keyed by external id, for asserting on what got queued. */
  const gameIdsByExternalId = async (): Promise<Map<string, string>> => {
    const games = await gameRepository.list(userId, { limit: 100, orderBy: 'createdAt', orderDirection: 'desc' })
    return new Map(games.map((game) => [game.externalGameId, game.id]))
  }

  it('queues analysis for each newly-imported game, newest first', async () => {
    await runJob([
      {
        batchKey: '2024-01',
        isComplete: false,
        games: [
          externalGame('older', { playedAt: new Date('2024-01-02T12:00:00Z') }),
          externalGame('newer', { playedAt: new Date('2024-01-20T12:00:00Z') }),
        ],
      },
    ])

    const ids = await gameIdsByExternalId()
    expect(analysisQueue).toEqual([
      { gameId: ids.get('newer'), userId },
      { gameId: ids.get('older'), userId },
    ])
  })

  it('does not re-queue games that have already been analyzed', async () => {
    const batch = { batchKey: '2024-01', isComplete: false, games: [externalGame('g1'), externalGame('g2')] }
    await runJob([batch])
    const ids = await gameIdsByExternalId()
    await gameRepository.setAnalysisStatus(userId, ids.get('g1')!, 'analyzed')
    await gameRepository.setAnalysisStatus(userId, ids.get('g2')!, 'analyzed')

    // Re-importing the same month plus one new game queues only the new game
    analysisQueue = []
    await runJob([{ ...batch, games: [...batch.games, externalGame('g3')] }])
    expect(analysisQueue.map((entry) => entry.gameId)).toEqual([(await gameIdsByExternalId()).get('g3')])
  })

  it('re-queues games that were imported earlier but never analyzed', async () => {
    // e.g. imported before analysis existed, or their enqueue was lost after the insert committed —
    // the game isn't in this run's batches at all, so only a sweep of the account can find it.
    await gameRepository.insertMany([
      {
        userId,
        gameAccountId: account.id,
        source: 'chesscom',
        externalGameId: 'stranded',
        pgn: VALID_PGN,
        playedAt: new Date('2023-11-01T12:00:00Z'),
        timeControl: '600',
        userColor: 'white',
        opponentUsername: 'opponent',
        result: 'win',
      },
    ])

    await runJob([])
    expect(analysisQueue.map((entry) => entry.gameId)).toEqual([(await gameIdsByExternalId()).get('stranded')])
  })

  it('re-queues games stuck analyzing or failed', async () => {
    await runJob([{ batchKey: '2024-01', isComplete: false, games: [externalGame('stuck'), externalGame('failed')] }])
    const ids = await gameIdsByExternalId()
    await gameRepository.setAnalysisStatus(userId, ids.get('stuck')!, 'analyzing')
    await gameRepository.setAnalysisStatus(userId, ids.get('failed')!, 'failed')

    analysisQueue = []
    await runJob([])
    expect(new Set(analysisQueue.map((entry) => entry.gameId))).toEqual(new Set([ids.get('stuck'), ids.get('failed')]))
  })

  it('advances the checkpoint to the newest complete batch and records the sync time', async () => {
    await runJob([
      { batchKey: '2024-03', isComplete: false, games: [externalGame('current-month')] },
      { batchKey: '2024-02', isComplete: true, games: [externalGame('g1')] },
      { batchKey: '2024-01', isComplete: true, games: [externalGame('g2')] },
    ])
    const updated = await gameAccountRepository.findById(userId, account.id)
    expect(updated?.syncCheckpoint).toBe('2024-02')
    expect(updated?.lastSyncedAt).toBeInstanceOf(Date)
  })

  it('leaves the checkpoint alone when only incomplete batches were fetched', async () => {
    await runJob([{ batchKey: '2024-03', isComplete: false, games: [externalGame('g1')] }])
    const updated = await gameAccountRepository.findById(userId, account.id)
    expect(updated?.syncCheckpoint).toBeNull()
    expect(updated?.lastSyncedAt).toBeInstanceOf(Date)
  })

  it('passes the stored checkpoint and month cap to the source', async () => {
    await gameAccountRepository.recordSyncCompleted(userId, account.id, '2024-05')
    const source = await runJob([], 7)
    expect(source.lastFetchOptions).toEqual({ sinceCheckpoint: '2024-05', maxBatches: 7 })
  })

  it('skips games with unparseable PGNs without failing the batch', async () => {
    await runJob([
      {
        batchKey: '2024-01',
        isComplete: true,
        games: [externalGame('good'), externalGame('bad', { pgn: 'this is not a pgn [%!' })],
      },
    ])
    expect(await gameRepository.countByGameAccount(userId, account.id)).toBe(1)
  })

  it('is a no-op for a deleted account', async () => {
    const job = buildImportGamesJob({
      gameAccountRepository,
      gameRepository,
      gameSources: buildGameSourceRegistry([new FakeGameSource([])]),
      maxMonths: 3,
      enqueueAnalysis: () => Promise.resolve(null),
    })
    await expect(job({ gameAccountId: crypto.randomUUID(), userId })).resolves.toBeUndefined()
  })

  it('persists the normalized game fields', async () => {
    await runJob([
      {
        batchKey: '2024-01',
        isComplete: true,
        games: [
          externalGame('g1', {
            userColor: 'black',
            result: 'loss',
            opponentUsername: 'magnus',
            timeControl: '180+2',
            playedAt: new Date('2024-01-20T18:30:00Z'),
          }),
        ],
      },
    ])
    const games = await gameRepository.list(userId, { limit: 10, orderBy: 'createdAt', orderDirection: 'desc' })
    expect(games).toHaveLength(1)
    const game = games[0]!
    expect(game.externalGameId).toBe('g1')
    expect(game.userColor).toBe('black')
    expect(game.result).toBe('loss')
    expect(game.opponentUsername).toBe('magnus')
    expect(game.timeControl).toBe('180+2')
    expect(game.playedAt).toEqual(new Date('2024-01-20T18:30:00Z'))
    expect(game.analysisStatus).toBe('pending')
    expect(game.pgn).toBe(VALID_PGN)
  })
})
