import { NotFoundError } from '@tactica/errors'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../../db/client.js'
import { gameAccountTable } from '../../db/schema.js'
import { GameRepository } from '../game/GameRepository.js'
import { GameAccountRepository } from './GameAccountRepository.js'

describe('GameAccountRepository (integration)', () => {
  const repo = new GameAccountRepository(db)
  const gameRepo = new GameRepository(db)
  let userId: string

  beforeEach(async () => {
    await db.delete(gameAccountTable)
    userId = crypto.randomUUID()
  })

  afterAll(async () => {
    await sql.end()
  })

  it('creates and fetches accounts scoped to the owning user', async () => {
    const created = await repo.create({ userId, source: 'chesscom', externalUsername: 'testuser' })
    expect(created.syncCheckpoint).toBeNull()
    expect(created.lastSyncedAt).toBeNull()

    expect(await repo.findById(userId, created.id)).toEqual(created)
    expect(await repo.findById(crypto.randomUUID(), created.id)).toBeUndefined()
    expect(await repo.list(userId)).toEqual([created])
  })

  it('enforces one account per source per user', async () => {
    await repo.create({ userId, source: 'chesscom', externalUsername: 'first' })
    await expect(repo.create({ userId, source: 'chesscom', externalUsername: 'second' })).rejects.toThrow()
    // ...but a different user can link the same source
    await expect(
      repo.create({ userId: crypto.randomUUID(), source: 'chesscom', externalUsername: 'second' }),
    ).resolves.toBeDefined()
  })

  it('records sync completion, advancing the checkpoint only when provided', async () => {
    const created = await repo.create({ userId, source: 'chesscom', externalUsername: 'testuser' })

    await repo.recordSyncCompleted(userId, created.id, '2024-02')
    let updated = await repo.findById(userId, created.id)
    expect(updated?.syncCheckpoint).toBe('2024-02')
    const firstSyncedAt = updated?.lastSyncedAt
    expect(firstSyncedAt).toBeInstanceOf(Date)

    await repo.recordSyncCompleted(userId, created.id)
    updated = await repo.findById(userId, created.id)
    expect(updated?.syncCheckpoint).toBe('2024-02') // unchanged
  })

  it('stores the last sync job id', async () => {
    const created = await repo.create({ userId, source: 'chesscom', externalUsername: 'testuser' })
    await repo.setLastSyncJobId(userId, created.id, 'job-123')
    expect((await repo.findById(userId, created.id))?.lastSyncJobId).toBe('job-123')
  })

  it('deletes an account and cascades to its games', async () => {
    const created = await repo.create({ userId, source: 'chesscom', externalUsername: 'testuser' })
    await gameRepo.insertMany([
      {
        userId,
        gameAccountId: created.id,
        source: 'chesscom',
        externalGameId: 'g1',
        pgn: '1. e4 e5 1/2-1/2',
        playedAt: new Date(),
        timeControl: '600',
        userColor: 'white',
        opponentUsername: 'opponent',
        result: 'draw',
      },
    ])
    await repo.delete(userId, created.id)
    expect(await repo.list(userId)).toHaveLength(0)
    expect(await gameRepo.countByGameAccount(userId, created.id)).toBe(0)
  })

  it('prevents cross-user deletes and updates', async () => {
    const created = await repo.create({ userId, source: 'chesscom', externalUsername: 'testuser' })
    await expect(repo.delete(crypto.randomUUID(), created.id)).rejects.toBeInstanceOf(NotFoundError)
    await expect(repo.setLastSyncJobId(crypto.randomUUID(), created.id, 'job-1')).rejects.toBeInstanceOf(NotFoundError)
  })
})
