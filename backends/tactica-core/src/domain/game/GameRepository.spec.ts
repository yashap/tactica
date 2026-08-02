import { InputValidationError } from '@tactica/errors'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../../db/client.js'
import { gameAccountTable, type GameAccountRow, type NewGameRow } from '../../db/schema.js'
import { GameAccountRepository } from '../gameAccount/GameAccountRepository.js'
import { GameRepository, parseGameOrdering } from './GameRepository.js'

const newGameRow = (userId: string, gameAccountId: string, externalGameId: string, playedAt: Date): NewGameRow => ({
  userId,
  gameAccountId,
  source: 'chesscom',
  externalGameId,
  pgn: '1. e4 e5 1/2-1/2',
  playedAt,
  timeControl: '600',
  userColor: 'white',
  opponentUsername: 'opponent',
  result: 'draw',
})

describe('GameRepository (integration)', () => {
  const accountRepo = new GameAccountRepository(db)
  const repo = new GameRepository(db)
  let userId: string
  let account: GameAccountRow

  beforeEach(async () => {
    await db.delete(gameAccountTable)
    userId = crypto.randomUUID()
    account = await accountRepo.create({ userId, source: 'chesscom', externalUsername: 'testuser' })
  })

  afterAll(async () => {
    await sql.end()
  })

  it('deduplicates inserts on (userId, source, externalGameId)', async () => {
    const insertedFirst = await repo.insertMany([
      newGameRow(userId, account.id, 'g1', new Date('2024-01-01')),
      newGameRow(userId, account.id, 'g2', new Date('2024-01-02')),
    ])
    expect(insertedFirst).toBe(2)

    const insertedSecond = await repo.insertMany([
      newGameRow(userId, account.id, 'g2', new Date('2024-01-02')), // duplicate
      newGameRow(userId, account.id, 'g3', new Date('2024-01-03')),
    ])
    expect(insertedSecond).toBe(1)
    expect(await repo.countByGameAccount(userId, account.id)).toBe(3)
  })

  it('reports which externalGameIds are already imported', async () => {
    await repo.insertMany([
      newGameRow(userId, account.id, 'have-1', new Date('2024-01-01')),
      newGameRow(userId, account.id, 'have-2', new Date('2024-01-02')),
    ])

    const existing = await repo.findExistingExternalGameIds(userId, 'chesscom', ['have-1', 'missing', 'have-2'])
    expect(existing).toEqual(new Set(['have-1', 'have-2']))

    expect(await repo.findExistingExternalGameIds(userId, 'chesscom', [])).toEqual(new Set())
    expect(await repo.findExistingExternalGameIds(userId, 'chesscom', ['missing'])).toEqual(new Set())
    // Scoped by user and by source, matching the unique index that dedupes inserts
    expect(await repo.findExistingExternalGameIds(crypto.randomUUID(), 'chesscom', ['have-1'])).toEqual(new Set())
    expect(await repo.findExistingExternalGameIds(userId, 'lichess', ['have-1'])).toEqual(new Set())
  })

  it('allows the same externalGameId for different users', async () => {
    const otherUserId = crypto.randomUUID()
    const otherAccount = await accountRepo.create({
      userId: otherUserId,
      source: 'chesscom',
      externalUsername: 'other',
    })
    await repo.insertMany([newGameRow(userId, account.id, 'shared-game', new Date())])
    const inserted = await repo.insertMany([newGameRow(otherUserId, otherAccount.id, 'shared-game', new Date())])
    expect(inserted).toBe(1)
  })

  it('paginates with a keyset cursor ordered by playedAt', async () => {
    const days = [1, 2, 3, 4, 5]
    await repo.insertMany(
      days.map((day) => newGameRow(userId, account.id, `g${day}`, new Date(`2024-03-0${day}T12:00:00Z`))),
    )

    const firstPage = await repo.list(userId, { limit: 2, orderBy: 'playedAt', orderDirection: 'desc' })
    expect(firstPage.map((g) => g.externalGameId)).toEqual(['g5', 'g4'])

    const lastSeen = firstPage[firstPage.length - 1]!
    const secondPage = await repo.list(userId, {
      limit: 2,
      orderBy: 'playedAt',
      orderDirection: 'desc',
      lastOrderValueSeen: lastSeen.playedAt,
      lastIdSeen: lastSeen.id,
    })
    expect(secondPage.map((g) => g.externalGameId)).toEqual(['g3', 'g2'])
  })

  it('scopes queries by user', async () => {
    await repo.insertMany([newGameRow(userId, account.id, 'mine', new Date())])
    const games = await repo.list(crypto.randomUUID(), { limit: 10, orderBy: 'createdAt', orderDirection: 'desc' })
    expect(games).toHaveLength(0)
    expect(
      await repo.findById(
        crypto.randomUUID(),
        (await repo.list(userId, { limit: 1, orderBy: 'createdAt', orderDirection: 'desc' }))[0]!.id,
      ),
    ).toBeUndefined()
  })

  it('rejects unknown orderBy fields and malformed cursor values', () => {
    expect(() => parseGameOrdering({ orderBy: 'pgn', lastOrderValueSeen: new Date().toISOString() })).toThrow(
      InputValidationError,
    )
    expect(() => parseGameOrdering({ orderBy: 'playedAt', lastOrderValueSeen: 'not-a-date' })).toThrow(
      InputValidationError,
    )
    expect(parseGameOrdering({ orderBy: 'playedAt', lastOrderValueSeen: '2024-01-01T00:00:00Z' })).toEqual({
      orderBy: 'playedAt',
      lastOrderValueSeen: new Date('2024-01-01T00:00:00Z'),
    })
  })
})
