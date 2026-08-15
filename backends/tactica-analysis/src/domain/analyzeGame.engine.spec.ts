import { Chess } from 'chess.js'
import { describe, expect, it } from 'vitest'
import { analyzeGame } from './analyzeGame.js'
import { StockfishClient } from './StockfishClient.js'

/**
 * The one test that exercises a real engine end to end, rather than a scripted one. Everything else
 * about blunder detection is pinned by pure tests; this exists to catch the things a fake can't —
 * mainly that our UCI plumbing, FEN handling and perspective conversion agree with what Stockfish
 * actually says.
 *
 * Skipped unless a stockfish service is reachable, so `pnpm test` stays hermetic. To run it:
 *   pnpm serve:backend            # or: docker run -p 3503:3503 tactica-stockfish:local
 *   pnpm --filter @tactica/tactica-analysis test
 */

const STOCKFISH_URL = process.env['STOCKFISH_URL'] ?? 'http://localhost:3503'

const stockfishReachable = async (): Promise<boolean> => {
  try {
    const response = await fetch(`${STOCKFISH_URL}/health`, { signal: AbortSignal.timeout(1500) })
    return response.ok
  } catch {
    return false
  }
}

const reachable = await stockfishReachable()

describe.skipIf(!reachable)('analyzeGame against a real engine', () => {
  it('catches a queen hung for nothing', async () => {
    // 1. e4 e5 2. Qh5 Nc6 3. Qxf7?? — the queen simply drops to Kxf7. Chosen because no depth of
    // search is required to see it, so the assertion holds even at a tiny movetime.
    const board = new Chess()
    for (const san of ['e4', 'e5', 'Qh5', 'Nc6', 'Qxf7+', 'Kxf7']) board.move(san)

    const result = await analyzeGame(
      { engine: new StockfishClient(STOCKFISH_URL) },
      { pgn: board.pgn(), playerColor: 'white', scanMovetimeMs: 60, deepMovetimeMs: 150, multiPv: 3 },
    )

    // One eval per position the game passed through
    expect(result.moveEvals).toHaveLength(7)

    // Ply 4 is Qxf7+; white was roughly level before it and a queen down after
    const hangingQueen = result.blunders.find((blunder) => blunder.ply === 4)
    expect(
      hangingQueen,
      `expected a blunder at ply 4, got ${JSON.stringify(result.blunders.map((b) => b.ply))}`,
    ).toBeDefined()
    expect(hangingQueen!.playedMoveSan).toBe('Qxf7+')
    expect(hangingQueen!.severity).toBe('blunder')
    expect(hangingQueen!.winProbAfter).toBeLessThan(hangingQueen!.winProbBefore)

    // The puzzle position must be the one *before* the mistake, with white still to move
    const puzzlePosition = new Chess(hangingQueen!.fen)
    expect(puzzlePosition.turn()).toBe('w')
    // ...and the engine's suggestion must be legal there, which is what proves the FEN and the line
    // actually correspond
    expect(() => puzzlePosition.move(hangingQueen!.bestMoveSan)).not.toThrow()
    expect(hangingQueen!.bestMoveUci).not.toBe('h5f7')
    expect(hangingQueen!.engineLines.length).toBeGreaterThan(0)
    expect(hangingQueen!.engineLines[0]!.pvSan.length).toBeGreaterThan(0)
  }, 60_000)

  it('does not invent blunders in a quiet, balanced opening', async () => {
    const board = new Chess()
    for (const san of ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6']) board.move(san)

    const result = await analyzeGame(
      { engine: new StockfishClient(STOCKFISH_URL) },
      { pgn: board.pgn(), playerColor: 'white', scanMovetimeMs: 60, deepMovetimeMs: 150, multiPv: 3 },
    )

    // The Ruy Lopez is not a series of catastrophes
    expect(result.blunders).toHaveLength(0)
  }, 60_000)
})
