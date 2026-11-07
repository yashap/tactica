import { Chess } from 'chess.js'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db, sql } from '../db/client.js'
import { analysisTable } from '../db/schema.js'
import { AnalysisRepository } from '../domain/AnalysisRepository.js'
import { type EvaluateRequest, type EvaluateResult, type StockfishEvaluator } from '../domain/StockfishClient.js'
import { buildRunAnalysisJob } from './runAnalysisJob.js'

const buildPgn = (sanMoves: string[]): string => {
  const board = new Chess()
  for (const san of sanMoves) board.move(san)
  return board.pgn()
}

const START_FEN = new Chess().fen()

/**
 * Says white is fine at the start and lost immediately afterwards, so white's first move reads as a
 * blunder. Note the eval has to *change* — a constant "black is winning" would mean no drop at all.
 */
class BlunderingEngine implements StockfishEvaluator {
  public calls = 0

  public evaluate(request: EvaluateRequest): Promise<EvaluateResult> {
    this.calls += 1
    const whiteToMove = request.fen.split(' ')[1] === 'w'
    const whiteRelativeCp = request.fen === START_FEN ? 20 : -400
    // The engine reports from the side to move's point of view, so flip when it's black's turn
    const cp = whiteToMove ? whiteRelativeCp : -whiteRelativeCp
    if (request.multiPv > 1) {
      const board = new Chess(request.fen)
      const [legal] = board.moves({ verbose: true })
      const uci = legal ? `${legal.from}${legal.to}` : 'a1a1'
      return Promise.resolve({ bestMoveUci: uci, lines: [{ multipv: 1, depth: 20, pvUci: [uci], cp: 0 }] })
    }
    return Promise.resolve({ bestMoveUci: null, lines: [{ multipv: 1, depth: 12, pvUci: [], cp }] })
  }
}

class ExplodingEngine implements StockfishEvaluator {
  public evaluate(): Promise<EvaluateResult> {
    return Promise.reject(new Error('engine unreachable'))
  }
}

const DEFAULTS = { scanMovetimeMs: 10, deepMovetimeMs: 20, multiPv: 3 }

describe('runAnalysisJob (integration)', () => {
  const analysisRepository = new AnalysisRepository(db)

  beforeEach(async () => {
    await db.delete(analysisTable)
  })

  afterAll(async () => {
    await sql.end()
  })

  it('analyses a queued game and stores the result', async () => {
    const created = await analysisRepository.create({ pgn: buildPgn(['e4', 'e5']), playerColor: 'white' })
    const job = buildRunAnalysisJob({ analysisRepository, engine: new BlunderingEngine(), defaults: DEFAULTS })

    await job({ analysisId: created.id })

    const stored = await analysisRepository.findById(created.id)
    expect(stored?.status).toBe('succeeded')
    expect(stored?.error).toBeNull()
    expect(stored?.result?.moveEvals).toHaveLength(3)
    expect(stored?.result?.blunders.length).toBeGreaterThan(0)
  })

  it('honours per-analysis settings over the service defaults', async () => {
    const created = await analysisRepository.create({
      pgn: buildPgn(['e4', 'e5']),
      playerColor: 'white',
      settings: { scanMovetimeMs: 7 },
    })
    const engine = new BlunderingEngine()
    const requests: EvaluateRequest[] = []
    const recording: StockfishEvaluator = {
      evaluate: (request) => {
        requests.push(request)
        return engine.evaluate(request)
      },
    }
    const job = buildRunAnalysisJob({ analysisRepository, engine: recording, defaults: DEFAULTS })

    await job({ analysisId: created.id })

    expect(requests.filter((r) => r.multiPv === 1).every((r) => r.movetimeMs === 7)).toBe(true)
    // The unset ones still come from config
    expect(requests.filter((r) => r.multiPv > 1).every((r) => r.movetimeMs === DEFAULTS.deepMovetimeMs)).toBe(true)
  })

  it('records the failure and rethrows, so pg-boss can retry', async () => {
    const created = await analysisRepository.create({ pgn: buildPgn(['e4', 'e5']), playerColor: 'white' })
    const job = buildRunAnalysisJob({ analysisRepository, engine: new ExplodingEngine(), defaults: DEFAULTS })

    await expect(job({ analysisId: created.id })).rejects.toThrow(/engine unreachable/)

    const stored = await analysisRepository.findById(created.id)
    expect(stored?.status).toBe('failed')
    expect(stored?.error).toContain('engine unreachable')
  })

  it('recovers when a retry follows a failure', async () => {
    const created = await analysisRepository.create({ pgn: buildPgn(['e4', 'e5']), playerColor: 'white' })
    await expect(
      buildRunAnalysisJob({ analysisRepository, engine: new ExplodingEngine(), defaults: DEFAULTS })({
        analysisId: created.id,
      }),
    ).rejects.toThrow()

    await buildRunAnalysisJob({ analysisRepository, engine: new BlunderingEngine(), defaults: DEFAULTS })({
      analysisId: created.id,
    })

    const stored = await analysisRepository.findById(created.id)
    expect(stored?.status).toBe('succeeded')
    expect(stored?.error).toBeNull()
  })

  it('skips work that has already succeeded, so a duplicate delivery is cheap', async () => {
    const created = await analysisRepository.create({ pgn: buildPgn(['e4', 'e5']), playerColor: 'white' })
    const engine = new BlunderingEngine()
    const job = buildRunAnalysisJob({ analysisRepository, engine, defaults: DEFAULTS })

    await job({ analysisId: created.id })
    const callsAfterFirstRun = engine.calls
    await job({ analysisId: created.id })

    expect(engine.calls).toBe(callsAfterFirstRun)
  })

  it('is a no-op for an analysis that no longer exists', async () => {
    const job = buildRunAnalysisJob({ analysisRepository, engine: new BlunderingEngine(), defaults: DEFAULTS })
    await expect(job({ analysisId: crypto.randomUUID() })).resolves.toBeUndefined()
  })
})
