import { InputValidationError } from '@tactica/errors'
import { getLogger } from '@tactica/logging'
import {
  type AnalysisResult,
  type Blunder,
  type ChessColor,
  type EngineLine,
  type Evaluation,
  type MoveEval,
} from '@tactica/tactica-analysis-contract'
import { Chess, type Move } from 'chess.js'
import {
  ACCEPTABLE_MOVE_WIN_PROB_MARGIN,
  classifySeverity,
  isPuzzleWorthy,
  terminalEvaluation,
  toPlayerRelative,
  toWhiteRelative,
  winProbFromEvaluation,
} from './blunderDetection.js'
import { type EngineLine as RawEngineLine, type StockfishEvaluator } from './StockfishClient.js'

export interface AnalyzeGameRequest {
  pgn: string
  playerColor: ChessColor
  scanMovetimeMs: number
  deepMovetimeMs: number
  multiPv: number
}

export interface AnalyzeGameDeps {
  engine: StockfishEvaluator
}

/** chess.js speaks 'w'/'b'; our domain spells the colours out. Convert only at this boundary. */
const toChessJsColor = (color: ChessColor): 'w' | 'b' => (color === 'white' ? 'w' : 'b')
const sideToMoveOf = (fen: string): ChessColor => (fen.split(' ')[1] === 'b' ? 'black' : 'white')

const uciOf = (move: Move): string => `${move.from}${move.to}${move.promotion ?? ''}`

const uciToMove = (uci: string): { from: string; to: string; promotion?: string } => ({
  from: uci.slice(0, 2),
  to: uci.slice(2, 4),
  ...(uci.length > 4 ? { promotion: uci.slice(4, 5) } : {}),
})

/**
 * Convert a UCI line to SAN by replaying it from `fen`. Engine PVs are legal by construction, but a
 * truncated or stale line would throw — in that case keep the prefix we managed to convert rather
 * than losing the whole line.
 */
const toSanLine = (fen: string, pvUci: string[]): string[] => {
  const board = new Chess(fen)
  const san: string[] = []
  for (const uci of pvUci) {
    try {
      san.push(board.move(uciToMove(uci)).san)
    } catch {
      break
    }
  }
  return san
}

const toSanMove = (fen: string, uci: string): string | undefined => toSanLine(fen, [uci])[0]

/** Evaluate one position, white-relative. Terminal positions are scored without troubling the engine. */
const evaluatePosition = async (engine: StockfishEvaluator, fen: string, movetimeMs: number): Promise<Evaluation> => {
  const board = new Chess(fen)
  if (board.isGameOver()) {
    // The engine has nothing to search here and answers with no lines at all, so asking would just
    // burn a round trip and hand us back nothing to score.
    return terminalEvaluation({ isCheckmate: board.isCheckmate() }, sideToMoveOf(fen))
  }
  const { lines } = await engine.evaluate({ fen, movetimeMs, multiPv: 1 })
  const best = lines[0]
  if (!best) {
    throw new Error(`Engine returned no lines for a non-terminal position: ${fen}`)
  }
  return toWhiteRelative(scoreOf(best), sideToMoveOf(fen))
}

const scoreOf = (line: RawEngineLine): Evaluation => ({
  ...(line.cp === undefined ? {} : { cp: line.cp }),
  ...(line.mate === undefined ? {} : { mate: line.mate }),
})

/**
 * Analyze a game and return every position's evaluation plus the player's puzzle-worthy mistakes.
 *
 * Two passes, because depth is expensive and most positions are unremarkable:
 *  1. A cheap single-PV sweep of every position, which is enough to spot where the player's win
 *     probability fell off a cliff.
 *  2. A slower multi-PV search of only those positions, to learn what they *should* have played and
 *     to capture the lines the coach will later explain.
 */
export const analyzeGame = async (deps: AnalyzeGameDeps, request: AnalyzeGameRequest): Promise<AnalysisResult> => {
  const logger = getLogger()
  const game = new Chess()
  try {
    game.loadPgn(request.pgn)
  } catch (error) {
    throw new InputValidationError(`Could not parse PGN: ${(error as Error).message}`)
  }

  const history = game.history({ verbose: true })
  if (history.length === 0) {
    return { moveEvals: [], blunders: [] }
  }

  // `history[i].before` is the FEN with ply i still to be played, and the last move's `after` is the
  // final position — so this covers every position the game passed through.
  const positions = [...history.map((move) => move.before), history[history.length - 1]!.after]

  // Pass 1: one cheap evaluation per position. Sequential on purpose — the engine serializes anyway.
  const evals: Evaluation[] = []
  for (const fen of positions) {
    evals.push(await evaluatePosition(deps.engine, fen, request.scanMovetimeMs))
  }

  const moveEvals: MoveEval[] = evals.map((evaluation, ply) => ({ ply, ...evaluation }))

  const playerColor = toChessJsColor(request.playerColor)
  const candidates = history.flatMap((move, ply) => {
    if (move.color !== playerColor) return []
    const before = evals[ply]
    const after = evals[ply + 1]
    if (!before || !after) return []
    const winProbBefore = winProbFromEvaluation(toPlayerRelative(before, request.playerColor))
    const winProbAfter = winProbFromEvaluation(toPlayerRelative(after, request.playerColor))
    const severity = classifySeverity(winProbBefore - winProbAfter)
    if (severity === undefined || !isPuzzleWorthy(severity)) return []
    return [{ move, ply, before, after, winProbBefore, winProbAfter, severity }]
  })

  // Pass 2: only the positions that turned out to matter.
  const blunders: Blunder[] = []
  for (const candidate of candidates) {
    const fen = candidate.move.before
    const { lines } = await deps.engine.evaluate({
      fen,
      movetimeMs: request.deepMovetimeMs,
      multiPv: request.multiPv,
    })
    const bestLine = lines[0]
    const bestMoveUci = bestLine?.pvUci[0]
    if (!bestLine || bestMoveUci === undefined) {
      logger.warn('Deep pass returned no line for a flagged position; skipping it', { fen, ply: candidate.ply })
      continue
    }
    const bestMoveSan = toSanMove(fen, bestMoveUci)
    if (bestMoveSan === undefined) {
      logger.warn('Engine best move was not legal in the position; skipping it', { fen, bestMoveUci })
      continue
    }

    // At this position the player is to move, so the engine's side-to-move-relative scores are
    // already player-relative — no conversion needed for comparing alternatives to each other.
    const bestWinProb = winProbFromEvaluation(scoreOf(bestLine))
    const engineLines: EngineLine[] = lines.map((line) => ({
      multipv: line.multipv,
      depth: line.depth,
      pvUci: line.pvUci,
      pvSan: toSanLine(fen, line.pvUci),
      ...(line.cp === undefined ? {} : { cp: line.cp }),
      ...(line.mate === undefined ? {} : { mate: line.mate }),
    }))
    const acceptableMovesUci = lines
      .filter((line) => bestWinProb - winProbFromEvaluation(scoreOf(line)) <= ACCEPTABLE_MOVE_WIN_PROB_MARGIN)
      .flatMap((line) => (line.pvUci[0] === undefined ? [] : [line.pvUci[0]]))

    blunders.push({
      ply: candidate.ply,
      fen,
      playedMoveUci: uciOf(candidate.move),
      playedMoveSan: candidate.move.san,
      bestMoveUci,
      bestMoveSan,
      acceptableMovesUci,
      engineLines,
      evalBefore: candidate.before,
      evalAfter: candidate.after,
      winProbBefore: candidate.winProbBefore,
      winProbAfter: candidate.winProbAfter,
      severity: candidate.severity,
    })
  }

  logger.info('Analyzed game', {
    plies: history.length,
    positionsEvaluated: positions.length,
    blunders: blunders.length,
  })
  return { moveEvals, blunders }
}
