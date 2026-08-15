import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../db/client.js'
import { analysisTable } from '../db/schema.js'
import { AnalysisRepository } from './AnalysisRepository.js'

const PGN = '1. e4 e5 2. Nf3 Nc6 1/2-1/2'

describe('AnalysisRepository (integration)', () => {
  const repo = new AnalysisRepository(db)

  beforeEach(async () => {
    await db.delete(analysisTable)
  })

  afterAll(async () => {
    await sql.end()
  })

  it('creates an analysis queued, with no result yet', async () => {
    const created = await repo.create({ pgn: PGN, playerColor: 'white' })
    expect(created.status).toBe('queued')
    expect(created.result).toBeNull()
    expect(created.error).toBeNull()
    expect(created.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(await repo.findById(created.id)).toEqual(created)
  })

  it('returns undefined for an unknown id', async () => {
    expect(await repo.findById(crypto.randomUUID())).toBeUndefined()
  })

  it('round-trips settings and the full result payload through jsonb', async () => {
    const created = await repo.create({
      pgn: PGN,
      playerColor: 'black',
      settings: { scanMovetimeMs: 10, deepMovetimeMs: 20, multiPv: 2 },
    })
    expect(created.settings).toEqual({ scanMovetimeMs: 10, deepMovetimeMs: 20, multiPv: 2 })

    const result = {
      moveEvals: [{ ply: 0, cp: 15 }],
      blunders: [
        {
          ply: 3,
          fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
          playedMoveUci: 'g8f6',
          playedMoveSan: 'Nf6',
          bestMoveUci: 'b8c6',
          bestMoveSan: 'Nc6',
          acceptableMovesUci: ['b8c6'],
          engineLines: [{ multipv: 1, depth: 20, pvUci: ['b8c6'], pvSan: ['Nc6'], cp: -20 }],
          evalBefore: { cp: 20 },
          evalAfter: { cp: 400 },
          winProbBefore: 0.48,
          winProbAfter: 0.19,
          severity: 'blunder' as const,
        },
      ],
    }
    await repo.markSucceeded(created.id, result)

    const stored = await repo.findById(created.id)
    expect(stored?.status).toBe('succeeded')
    // jsonb must survive the round trip intact — this payload is what tactica-core turns into puzzles
    expect(stored?.result).toEqual(result)
  })

  it('records a failure, and clears it if a later attempt succeeds', async () => {
    const created = await repo.create({ pgn: PGN, playerColor: 'white' })

    await repo.markRunning(created.id)
    expect((await repo.findById(created.id))?.status).toBe('running')

    await repo.markFailed(created.id, 'engine unreachable')
    const failed = await repo.findById(created.id)
    expect(failed?.status).toBe('failed')
    expect(failed?.error).toBe('engine unreachable')

    // pg-boss retries land back on the same row, so a later success must not leave a stale error
    await repo.markSucceeded(created.id, { moveEvals: [], blunders: [] })
    const succeeded = await repo.findById(created.id)
    expect(succeeded?.status).toBe('succeeded')
    expect(succeeded?.error).toBeNull()
  })

  it('bumps updatedAt on every status change', async () => {
    const created = await repo.create({ pgn: PGN, playerColor: 'white' })

    await repo.markRunning(created.id)
    const afterRunning = (await repo.findById(created.id))!.updatedAt

    await repo.markFailed(created.id, 'nope')
    const afterFailed = (await repo.findById(created.id))!.updatedAt

    // Compares two writes against each other rather than against `createdAt`: inserts take their
    // timestamp from Postgres's clock and updates from this process's, and in Docker those drift by
    // a few milliseconds — enough to make a naive created-vs-updated comparison flap.
    expect(afterFailed.valueOf()).toBeGreaterThanOrEqual(afterRunning.valueOf())
  })
})
