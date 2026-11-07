import { type BlunderSeverity, type ChessColor, type Evaluation } from '@tactica/tactica-analysis-contract'

/**
 * Blunder detection, as pure functions. No engine, no IO — every subtle rule about signs, mates and
 * thresholds lives here so it can be pinned by hand-computed tests.
 */

/**
 * Lichess's logistic mapping from centipawns to win probability. The constant is theirs; it fits
 * observed results across millions of games far better than treating centipawns as linear.
 */
const WIN_PROB_K = 0.00368208

/**
 * A position where the side to move is *already* checkmated is reported as `mate: ∓1` (i.e. mate for
 * the opponent) rather than `mate: 0`. Zero has no sign, so it would survive negation unchanged and
 * silently break perspective flipping.
 */
const TERMINAL_MATE = 1

export const winProbFromCp = (cp: number): number => 1 / (1 + Math.exp(-WIN_PROB_K * cp))

/**
 * Win probability, 0–1, for whichever side the evaluation is expressed from. Feed it a
 * player-relative evaluation to get that player's chances.
 */
export const winProbFromEvaluation = (evaluation: Evaluation): number => {
  // A forced mate is a certainty either way; there's no useful gradient between "mate in 2" and
  // "mate in 7", and pretending otherwise would let mate distance masquerade as a blunder.
  if (evaluation.mate !== undefined) return evaluation.mate > 0 ? 1 : 0
  if (evaluation.cp === undefined) {
    throw new Error('Evaluation has neither cp nor mate')
  }
  return winProbFromCp(evaluation.cp)
}

/** Flip an evaluation to the opposing side's point of view. */
export const negateEvaluation = (evaluation: Evaluation): Evaluation => ({
  ...(evaluation.cp === undefined ? {} : { cp: -evaluation.cp }),
  ...(evaluation.mate === undefined ? {} : { mate: -evaluation.mate }),
})

/**
 * UCI reports scores from the perspective of whoever is to move. **This is the single most
 * error-prone step in the pipeline** — get it wrong and every eval for one colour is inverted, which
 * looks like the player blundering on every other move. Convert to white-relative once, at the
 * boundary, and keep everything downstream in that frame.
 */
export const toWhiteRelative = (sideToMoveRelative: Evaluation, sideToMove: ChessColor): Evaluation =>
  sideToMove === 'white' ? sideToMoveRelative : negateEvaluation(sideToMoveRelative)

export const toPlayerRelative = (whiteRelative: Evaluation, player: ChessColor): Evaluation =>
  player === 'white' ? whiteRelative : negateEvaluation(whiteRelative)

/**
 * Evaluation of a position the engine cannot search because the game is already over. Expressed
 * white-relative, like everything else this module hands back.
 */
export const terminalEvaluation = (outcome: { isCheckmate: boolean }, sideToMove: ChessColor): Evaluation => {
  if (!outcome.isCheckmate) return { cp: 0 } // stalemate or any other draw — dead even
  // The side to move has been mated, so the *other* side delivered it
  return { mate: sideToMove === 'white' ? -TERMINAL_MATE : TERMINAL_MATE }
}

/**
 * Win-probability drop thresholds, mirroring lichess's inaccuracy/mistake/blunder tiers. Thresholding
 * the drop in win probability rather than raw centipawn loss is what stops a +9 → +6 swing in an
 * already-won position from being flagged as a catastrophe.
 */
export const WIN_PROB_DROP_THRESHOLDS: Record<BlunderSeverity, number> = {
  blunder: 0.3,
  mistake: 0.2,
  inaccuracy: 0.1,
}

/** `undefined` when the move wasn't bad enough to be worth mentioning. */
export const classifySeverity = (winProbDrop: number): BlunderSeverity | undefined => {
  if (winProbDrop >= WIN_PROB_DROP_THRESHOLDS.blunder) return 'blunder'
  if (winProbDrop >= WIN_PROB_DROP_THRESHOLDS.mistake) return 'mistake'
  if (winProbDrop >= WIN_PROB_DROP_THRESHOLDS.inaccuracy) return 'inaccuracy'
  return undefined
}

/**
 * Severities that become puzzles. Inaccuracies are still detected and scored — they're just too
 * mild to make a satisfying "find the best move", so they don't graduate.
 */
const PUZZLE_WORTHY: ReadonlySet<BlunderSeverity> = new Set<BlunderSeverity>(['mistake', 'blunder'])

export const isPuzzleWorthy = (severity: BlunderSeverity): boolean => PUZZLE_WORTHY.has(severity)

/**
 * How much worse than the engine's top choice an alternative can be and still count as "right" for
 * puzzle purposes, in win probability. Positions often have several equally winning ideas, and
 * demanding the engine's exact pick would fail people for finding one of them.
 */
export const ACCEPTABLE_MOVE_WIN_PROB_MARGIN = 0.05
