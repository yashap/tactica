import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../../db/client.js'
import { gameAccountTable, type NewPuzzleRow } from '../../db/schema.js'
import { GameAccountRepository } from '../gameAccount/GameAccountRepository.js'
import { GameRepository } from '../game/GameRepository.js'
import { PuzzleRepository } from './PuzzleRepository.js'

const puzzleRow = (userId: string, gameId: string, ply: number): NewPuzzleRow => ({
  userId,
  gameId,
  ply,
  fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR w KQkq - 2 3',
  playerColor: 'white',
  playedMoveUci: 'h5f7',
  playedMoveSan: 'Qxf7+',
  bestMoveUci: 'f1c4',
  bestMoveSan: 'Bc4',
  acceptableMovesUci: ['f1c4'],
  engineLines: [],
  evalBefore: { cp: 40 },
  evalAfter: { cp: -900 },
  winProbBefore: 0.53,
  winProbAfter: 0.03,
  severity: 'blunder',
})

describe('PuzzleRepository (integration)', () => {
  const accountRepo = new GameAccountRepository(db)
  const gameRepo = new GameRepository(db)
  const repo = new PuzzleRepository(db)

  /** A user with one game and `count` puzzles from it; returns their ids. */
  const seedUser = async (count: number): Promise<{ userId: string; puzzleIds: string[] }> => {
    const userId = crypto.randomUUID()
    const account = await accountRepo.create({ userId, source: 'chesscom', externalUsername: `u-${userId}` })
    const [game] = await gameRepo.insertMany([
      {
        userId,
        gameAccountId: account.id,
        source: 'chesscom',
        externalGameId: `g-${userId}`,
        pgn: '1. e4 e5 2. Qh5 Nc6 3. Qxf7+ Kxf7',
        playedAt: new Date('2024-01-20T18:30:00Z'),
        timeControl: '600',
        userColor: 'white',
        opponentUsername: 'opponent',
        result: 'loss',
      },
    ])
    await repo.insertMany(Array.from({ length: count }, (_, i) => puzzleRow(userId, game!.id, i * 2)))
    const puzzles = await repo.list(userId, { limit: 50, orderBy: 'createdAt', orderDirection: 'asc' })
    return { userId, puzzleIds: puzzles.map((puzzle) => puzzle.id) }
  }

  const attempt = (userId: string, puzzleId: string, correct: boolean) =>
    repo.createAttempt({ userId, puzzleId, moveUci: correct ? 'f1c4' : 'h5f7', correct })

  beforeEach(async () => {
    await db.delete(gameAccountTable) // cascades to Game → Puzzle → PuzzleAttempt
  })

  afterAll(async () => {
    await sql.end()
  })

  it('distinguishes solved on the first try from solved after a miss', async () => {
    const { userId, puzzleIds } = await seedUser(4)
    const [untouched, firstTry, afterMiss, onlyMissed] = puzzleIds as [string, string, string, string]
    await attempt(userId, firstTry, true)
    await attempt(userId, afterMiss, false)
    await attempt(userId, afterMiss, true) // the miss revealed the answer
    await attempt(userId, onlyMissed, false)

    const byId = new Map(
      (await repo.list(userId, { limit: 50, orderBy: 'createdAt', orderDirection: 'asc' })).map((p) => [p.id, p]),
    )
    expect(byId.get(untouched)).toMatchObject({ solved: false, solvedFirstTry: false })
    expect(byId.get(firstTry)).toMatchObject({ solved: true, solvedFirstTry: true })
    expect(byId.get(afterMiss)).toMatchObject({ solved: true, solvedFirstTry: false })
    expect(byId.get(onlyMissed)).toMatchObject({ solved: false, solvedFirstTry: false })
    // findById agrees with the list
    expect(await repo.findById(userId, afterMiss)).toMatchObject({ solved: true, solvedFirstTry: false })
  })

  it('keeps a later miss from undoing a first-try solve', async () => {
    const { userId, puzzleIds } = await seedUser(1)
    await attempt(userId, puzzleIds[0]!, true)
    await attempt(userId, puzzleIds[0]!, false)
    expect(await repo.findById(userId, puzzleIds[0]!)).toMatchObject({ solved: true, solvedFirstTry: true })
  })

  it("never shows one user another user's puzzle", async () => {
    const alice = await seedUser(1)
    const bob = await seedUser(1)
    expect(await repo.findById(bob.userId, alice.puzzleIds[0]!)).toBeUndefined()
    expect(
      (await repo.list(bob.userId, { limit: 50, orderBy: 'createdAt', orderDirection: 'asc' })).map((p) => p.id),
    ).toEqual(bob.puzzleIds)
  })
})
