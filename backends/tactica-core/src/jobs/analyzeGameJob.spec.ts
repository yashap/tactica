import { type Analysis, type Blunder, type CreateAnalysisRequest } from '@tactica/tactica-analysis-contract'
import { type TacticaAnalysisClient } from '@tactica/tactica-analysis-client'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../db/client.js'
import { gameAccountTable, type GameAccountRow, type NewGameRow } from '../db/schema.js'
import { GameAccountRepository } from '../domain/gameAccount/GameAccountRepository.js'
import { GameRepository } from '../domain/game/GameRepository.js'
import { PuzzleRepository } from '../domain/puzzle/PuzzleRepository.js'
import { buildAnalyzeGameJob } from './analyzeGameJob.js'

const PGN = '1. e4 e5 2. Qh5 Nc6 3. Qxf7+ Kxf7'

const blunder = (ply: number): Blunder => ({
  ply,
  fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR w KQkq - 4 3',
  playedMoveUci: 'h5f7',
  playedMoveSan: 'Qxf7+',
  bestMoveUci: 'f1c4',
  bestMoveSan: 'Bc4',
  acceptableMovesUci: ['f1c4', 'b1c3'],
  engineLines: [{ multipv: 1, depth: 20, pvUci: ['f1c4'], pvSan: ['Bc4'], cp: 40 }],
  evalBefore: { cp: 40 },
  evalAfter: { cp: -900 },
  winProbBefore: 0.53,
  winProbAfter: 0.03,
  severity: 'blunder',
})

const succeededAnalysis = (overrides: Partial<Analysis> = {}): Analysis => ({
  id: crypto.randomUUID(),
  status: 'succeeded',
  playerColor: 'white',
  result: { moveEvals: [{ ply: 0, cp: 20 }], blunders: [blunder(4)] },
  error: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  ...overrides,
})

/**
 * Stands in for the analysis service. `states` is served one per `get`, so a test can make the job
 * poll through queued → running → succeeded exactly as it would in production.
 */
class FakeAnalysisClient {
  public readonly created: CreateAnalysisRequest[] = []
  public getCalls = 0

  public constructor(
    private readonly submitted: Analysis,
    private readonly states: Analysis[] = [],
  ) {}

  public create(request: CreateAnalysisRequest): Promise<Analysis> {
    this.created.push(request)
    return Promise.resolve(this.submitted)
  }

  public get(_id: string): Promise<Analysis | undefined> {
    const next = this.states[Math.min(this.getCalls, this.states.length - 1)]
    this.getCalls += 1
    return Promise.resolve(next)
  }
}

const asClient = (fake: FakeAnalysisClient): TacticaAnalysisClient => fake as unknown as TacticaAnalysisClient

describe('analyzeGameJob (integration)', () => {
  const gameAccountRepository = new GameAccountRepository(db)
  const gameRepository = new GameRepository(db)
  const puzzleRepository = new PuzzleRepository(db)
  let userId: string
  let account: GameAccountRow
  let gameId: string

  const newGame = (): NewGameRow => ({
    userId,
    gameAccountId: account.id,
    source: 'chesscom',
    externalGameId: 'g1',
    pgn: PGN,
    playedAt: new Date('2024-01-20T18:30:00Z'),
    timeControl: '600',
    userColor: 'white',
    opponentUsername: 'opponent',
    result: 'loss',
  })

  const buildJob = (client: FakeAnalysisClient) =>
    buildAnalyzeGameJob({
      gameRepository,
      puzzleRepository,
      analysisClient: asClient(client),
      pollIntervalMs: 1,
      pollTimeoutMs: 5_000,
    })

  beforeEach(async () => {
    await db.delete(gameAccountTable) // cascades to Game, which cascades to Puzzle
    userId = crypto.randomUUID()
    account = await gameAccountRepository.create({ userId, source: 'chesscom', externalUsername: 'testuser' })
    const [inserted] = await gameRepository.insertMany([newGame()])
    gameId = inserted!.id
  })

  afterAll(async () => {
    await sql.end()
  })

  it('submits the game, polls to completion, and turns blunders into puzzles', async () => {
    const analysis = succeededAnalysis()
    const client = new FakeAnalysisClient({ ...analysis, status: 'queued', result: null }, [
      { ...analysis, status: 'running', result: null },
      analysis,
    ])

    await buildJob(client)({ gameId, userId })

    // Submitted with the game's PGN and the colour the user played
    expect(client.created).toEqual([{ pgn: PGN, playerColor: 'white' }])
    expect(client.getCalls).toBeGreaterThanOrEqual(2)

    const puzzles = await puzzleRepository.list(userId, {
      limit: 10,
      orderBy: 'createdAt',
      orderDirection: 'desc',
    })
    expect(puzzles).toHaveLength(1)
    const puzzle = puzzles[0]!
    expect(puzzle.ply).toBe(4)
    expect(puzzle.playedMoveSan).toBe('Qxf7+')
    expect(puzzle.bestMoveSan).toBe('Bc4')
    expect(puzzle.severity).toBe('blunder')
    expect(puzzle.acceptableMovesUci).toEqual(['f1c4', 'b1c3'])
    expect(puzzle.playerColor).toBe('white')
    // Game context comes along for the puzzle screen
    expect(puzzle.opponentUsername).toBe('opponent')

    const game = await gameRepository.findById(userId, gameId)
    expect(game?.analysisStatus).toBe('analyzed')
    expect(game?.moveEvals).toEqual([{ ply: 0, cp: 20 }])
  })

  it('is idempotent: re-running does not duplicate puzzles', async () => {
    const analysis = succeededAnalysis()
    await buildJob(new FakeAnalysisClient(analysis, [analysis]))({ gameId, userId })
    // Force a second pass over the same game by rewinding its status
    await gameRepository.setAnalysisStatus(userId, gameId, 'pending')
    await buildJob(new FakeAnalysisClient(analysis, [analysis]))({ gameId, userId })

    expect(await puzzleRepository.countByGameAccount(userId, account.id)).toBe(1)
  })

  it('skips a game that has already been analyzed', async () => {
    const analysis = succeededAnalysis()
    await buildJob(new FakeAnalysisClient(analysis, [analysis]))({ gameId, userId })

    const client = new FakeAnalysisClient(analysis, [analysis])
    await buildJob(client)({ gameId, userId })
    expect(client.created).toHaveLength(0)
  })

  it('marks the game failed and rethrows when analysis fails, so pg-boss retries', async () => {
    const failed = succeededAnalysis({ status: 'failed', result: null, error: 'engine exploded' })
    const client = new FakeAnalysisClient({ ...failed, status: 'queued' }, [failed])

    await expect(buildJob(client)({ gameId, userId })).rejects.toThrow(/engine exploded/)

    expect((await gameRepository.findById(userId, gameId))?.analysisStatus).toBe('failed')
  })

  it('gives up if the analysis never finishes, rather than polling forever', async () => {
    const stuck = succeededAnalysis({ status: 'running', result: null })
    const client = new FakeAnalysisClient({ ...stuck, status: 'queued' }, [stuck])
    const job = buildAnalyzeGameJob({
      gameRepository,
      puzzleRepository,
      analysisClient: asClient(client),
      pollIntervalMs: 1,
      pollTimeoutMs: 30,
    })

    await expect(job({ gameId, userId })).rejects.toThrow(/did not finish within/)
    expect((await gameRepository.findById(userId, gameId))?.analysisStatus).toBe('failed')
  })

  it('recovers on a later attempt after a failure', async () => {
    const failed = succeededAnalysis({ status: 'failed', result: null, error: 'nope' })
    await expect(
      buildJob(new FakeAnalysisClient({ ...failed, status: 'queued' }, [failed]))({ gameId, userId }),
    ).rejects.toThrow()

    const analysis = succeededAnalysis()
    await buildJob(new FakeAnalysisClient(analysis, [analysis]))({ gameId, userId })

    expect((await gameRepository.findById(userId, gameId))?.analysisStatus).toBe('analyzed')
    expect(await puzzleRepository.countByGameAccount(userId, account.id)).toBe(1)
  })

  it('stores a clean analysis with no blunders as analyzed, with no puzzles', async () => {
    const clean = succeededAnalysis({ result: { moveEvals: [{ ply: 0, cp: 5 }], blunders: [] } })
    await buildJob(new FakeAnalysisClient(clean, [clean]))({ gameId, userId })

    expect((await gameRepository.findById(userId, gameId))?.analysisStatus).toBe('analyzed')
    expect(await puzzleRepository.countByGameAccount(userId, account.id)).toBe(0)
  })

  it('is a no-op for a game that no longer exists', async () => {
    const analysis = succeededAnalysis()
    const client = new FakeAnalysisClient(analysis, [analysis])
    await expect(buildJob(client)({ gameId: crypto.randomUUID(), userId })).resolves.toBeUndefined()
    expect(client.created).toHaveLength(0)
  })
})
