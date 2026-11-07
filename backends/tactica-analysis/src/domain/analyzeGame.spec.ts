import { InputValidationError } from '@tactica/errors'
import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { analyzeGame } from './analyzeGame.js'
import { winProbFromCp } from './blunderDetection.js'
import { type EvaluateRequest, type EvaluateResult, type StockfishEvaluator } from './StockfishClient.js'

/**
 * Builds a PGN plus the exact FEN of every position it passes through, so tests can script an
 * evaluation per position without hard-coding FEN strings.
 */
const buildGame = (sanMoves: string[]): { pgn: string; positions: string[] } => {
  const board = new Chess()
  const positions = [board.fen()]
  for (const san of sanMoves) {
    board.move(san)
    positions.push(board.fen())
  }
  return { pgn: board.pgn(), positions }
}

interface FakeEngineScript {
  /** Side-to-move-relative centipawns per position index, exactly as UCI would report them. */
  scanCp: Record<number, number>
  /** Lines to answer the deep (multi-PV) pass with, per position index. */
  deepLines?: Record<number, EvaluateResult['lines']>
}

class FakeEngine implements StockfishEvaluator {
  public readonly requests: EvaluateRequest[] = []

  public constructor(
    private readonly positions: string[],
    private readonly script: FakeEngineScript,
  ) {}

  public evaluate(request: EvaluateRequest): Promise<EvaluateResult> {
    this.requests.push(request)
    const index = this.positions.indexOf(request.fen)
    if (index === -1) throw new Error(`Fake engine asked about an unknown position: ${request.fen}`)

    if (request.multiPv > 1) {
      const lines = this.script.deepLines?.[index]
      if (!lines) throw new Error(`No deep lines scripted for position ${index}`)
      return Promise.resolve({ bestMoveUci: lines[0]?.pvUci[0] ?? null, lines })
    }
    const cp = this.script.scanCp[index] ?? 0
    return Promise.resolve({
      bestMoveUci: null,
      lines: [{ multipv: 1, depth: 12, pvUci: [], cp }],
    })
  }
}

const SETTINGS = { scanMovetimeMs: 50, deepMovetimeMs: 200, multiPv: 3 }

describe('analyzeGame', () => {
  it('returns nothing for an empty game', async () => {
    const engine = new FakeEngine([], { scanCp: {} })
    const result = await analyzeGame({ engine }, { pgn: '', playerColor: 'white', ...SETTINGS })
    expect(result).toEqual({ moveEvals: [], blunders: [] })
    expect(engine.requests).toHaveLength(0)
  })

  it('rejects an unparseable PGN with a validation error', async () => {
    const engine = new FakeEngine([], { scanCp: {} })
    await expect(
      analyzeGame({ engine }, { pgn: 'this is not a pgn [%!', playerColor: 'white', ...SETTINGS }),
    ).rejects.toBeInstanceOf(InputValidationError)
  })

  it('evaluates every position once and reports white-relative evals for the graph', async () => {
    const { pgn, positions } = buildGame(['e4', 'e5'])
    // +30 for white to move, then +30 for *black* to move — which is -30 white-relative
    const engine = new FakeEngine(positions, { scanCp: { 0: 30, 1: 30, 2: 30 } })

    const result = await analyzeGame({ engine }, { pgn, playerColor: 'white', ...SETTINGS })

    expect(result.moveEvals).toHaveLength(positions.length)
    expect(result.moveEvals[0]).toEqual({ ply: 0, cp: 30 })
    // Position 1 has black to move, so the same engine score flips sign in white-relative terms
    expect(result.moveEvals[1]).toEqual({ ply: 1, cp: -30 })
    expect(result.moveEvals[2]).toEqual({ ply: 2, cp: 30 })
    expect(engine.requests.filter((r) => r.multiPv === 1)).toHaveLength(positions.length)
  })

  it('flags a white move that throws the game away, with the position to solve', async () => {
    const { pgn, positions } = buildGame(['e4', 'e5', 'Nf3', 'Nc6'])
    const engine = new FakeEngine(positions, {
      // Even at the start; white is +300 before ply 2, and after ply 2 black is +300 (white -300)
      scanCp: { 0: 20, 1: -20, 2: 300, 3: 300, 4: -300 },
      deepLines: {
        2: [
          { multipv: 1, depth: 20, pvUci: ['d2d4', 'e5d4'], cp: 300 },
          { multipv: 2, depth: 20, pvUci: ['f1c4'], cp: 295 },
          { multipv: 3, depth: 20, pvUci: ['g1f3'], cp: 100 },
        ],
      },
    })

    const { blunders } = await analyzeGame({ engine }, { pgn, playerColor: 'white', ...SETTINGS })

    expect(blunders).toHaveLength(1)
    const blunder = blunders[0]!
    expect(blunder.ply).toBe(2)
    // The puzzle is the position *before* the mistake, with the player still to move
    expect(blunder.fen).toBe(positions[2])
    expect(blunder.fen.split(' ')[1]).toBe('w')
    expect(blunder.playedMoveSan).toBe('Nf3')
    expect(blunder.playedMoveUci).toBe('g1f3')
    expect(blunder.bestMoveUci).toBe('d2d4')
    expect(blunder.bestMoveSan).toBe('d4')
    expect(blunder.severity).toBe('blunder')
    expect(blunder.winProbBefore).toBeCloseTo(winProbFromCp(300), 10)
    expect(blunder.winProbAfter).toBeCloseTo(winProbFromCp(-300), 10)
    expect(blunder.evalBefore).toEqual({ cp: 300 })
    expect(blunder.evalAfter).toEqual({ cp: -300 })
  })

  it('accepts alternatives that are near-equal to the best move, but not clearly worse ones', async () => {
    const { pgn, positions } = buildGame(['e4', 'e5', 'Nf3', 'Nc6'])
    const engine = new FakeEngine(positions, {
      scanCp: { 0: 20, 1: -20, 2: 300, 3: 300, 4: -300 },
      deepLines: {
        2: [
          { multipv: 1, depth: 20, pvUci: ['d2d4', 'e5d4'], cp: 300 },
          { multipv: 2, depth: 20, pvUci: ['f1c4'], cp: 295 }, // within the margin
          { multipv: 3, depth: 20, pvUci: ['g1f3'], cp: 100 }, // clearly worse
        ],
      },
    })

    const { blunders } = await analyzeGame({ engine }, { pgn, playerColor: 'white', ...SETTINGS })

    expect(blunders[0]!.acceptableMovesUci).toEqual(['d2d4', 'f1c4'])
    // Lines are handed on with SAN attached, ready for the coach
    expect(blunders[0]!.engineLines).toHaveLength(3)
    expect(blunders[0]!.engineLines[0]!.pvSan).toEqual(['d4', 'exd4'])
    expect(blunders[0]!.engineLines[1]!.pvSan).toEqual(['Bc4'])
  })

  it('only judges the requested player, ignoring the opponent falling apart', async () => {
    const { pgn, positions } = buildGame(['e4', 'e5', 'Nf3', 'Nc6'])
    // White-relative this is +20, +20, +400, +400, +400 — i.e. black's ply 1 handed white the game,
    // while white's own moves changed nothing. Scripted here side-to-move-relative, as UCI reports.
    const engine = new FakeEngine(positions, { scanCp: { 0: 20, 1: -20, 2: 400, 3: -400, 4: 400 } })

    const asWhite = await analyzeGame({ engine }, { pgn, playerColor: 'white', ...SETTINGS })

    expect(asWhite.blunders).toHaveLength(0)
    // No deep pass was needed, which also proves nothing was flagged
    expect(engine.requests.every((request) => request.multiPv === 1)).toBe(true)
  })

  it('finds the same game’s mistakes for black when asked about black', async () => {
    const { pgn, positions } = buildGame(['e4', 'e5', 'Nf3', 'Nc6'])
    // Before ply 1 black is +300 (side-to-move-relative); after ply 1 white is +300, so black is -300
    const engine = new FakeEngine(positions, {
      scanCp: { 0: 20, 1: 300, 2: 300, 3: 20, 4: 20 },
      deepLines: {
        1: [{ multipv: 1, depth: 20, pvUci: ['d7d5'], cp: 300 }],
      },
    })

    const { blunders } = await analyzeGame({ engine }, { pgn, playerColor: 'black', ...SETTINGS })

    expect(blunders).toHaveLength(1)
    expect(blunders[0]!.ply).toBe(1)
    expect(blunders[0]!.playedMoveSan).toBe('e5')
    expect(blunders[0]!.bestMoveSan).toBe('d5')
    expect(blunders[0]!.fen.split(' ')[1]).toBe('b')
  })

  it('does not promote an inaccuracy to a puzzle', async () => {
    const { pgn, positions } = buildGame(['e4', 'e5', 'Nf3', 'Nc6'])
    // ~0.13 win-probability drop: an inaccuracy, below the mistake threshold
    const engine = new FakeEngine(positions, { scanCp: { 0: 20, 1: -20, 2: 100, 3: -80, 4: 80 } })

    const { blunders } = await analyzeGame({ engine }, { pgn, playerColor: 'white', ...SETTINGS })
    expect(blunders).toHaveLength(0)
    // ...and no deep pass was wasted on it
    expect(engine.requests.every((request) => request.multiPv === 1)).toBe(true)
  })

  it('scores a checkmate ending without asking the engine about the final position', async () => {
    // Fool's mate: black mates on ply 3. White's ply 2 (g4) walks into it — level beforehand, dead
    // lost after, scripted side-to-move-relative (position 3 has black to move and black winning).
    const { pgn, positions } = buildGame(['f3', 'e5', 'g4', 'Qh4#'])
    const engine = new FakeEngine(positions, {
      scanCp: { 0: 20, 1: -50, 2: 0, 3: 900 },
      deepLines: { 2: [{ multipv: 1, depth: 20, pvUci: ['e2e4'], cp: 0 }] },
    })

    const result = await analyzeGame({ engine }, { pgn, playerColor: 'white', ...SETTINGS })

    // The final position is terminal, so it is scored locally rather than searched
    expect(engine.requests.some((request) => request.fen === positions[4])).toBe(false)
    expect(result.moveEvals).toHaveLength(5)
    // White is mated, so the last eval is a mate for black (negative, white-relative) — and never 0,
    // which would lose its sign under negation
    expect(result.moveEvals[4]!.mate).toBeLessThan(0)
    // Walking into mate is, unsurprisingly, a blunder
    expect(result.blunders.some((blunder) => blunder.ply === 2)).toBe(true)
  })

  it('uses the configured search budgets for each pass', async () => {
    const { pgn, positions } = buildGame(['e4', 'e5', 'Nf3', 'Nc6'])
    const engine = new FakeEngine(positions, {
      scanCp: { 0: 20, 1: -20, 2: 300, 3: 300, 4: -300 },
      deepLines: { 2: [{ multipv: 1, depth: 20, pvUci: ['d2d4'], cp: 300 }] },
    })

    await analyzeGame({ engine }, { pgn, playerColor: 'white', scanMovetimeMs: 11, deepMovetimeMs: 222, multiPv: 3 })

    const scans = engine.requests.filter((request) => request.multiPv === 1)
    const deep = engine.requests.filter((request) => request.multiPv > 1)
    expect(scans.every((request) => request.movetimeMs === 11)).toBe(true)
    expect(deep).toHaveLength(1)
    expect(deep[0]!.movetimeMs).toBe(222)
    expect(deep[0]!.multiPv).toBe(3)
  })
})
