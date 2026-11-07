import { Chess } from 'chess.js'

/** The parts of a puzzle grading needs. */
export interface GradablePuzzle {
  fen: string
  bestMoveUci: string
  acceptableMovesUci: string[]
}

/**
 * A move counts if it's the engine's pick or any of the near-equal alternatives it found. Positions
 * often have several equally good ideas, and failing someone for finding a different one would be
 * both wrong and infuriating. Moves are compared in UCI, so a promotion must name the right piece.
 */
export const isAcceptableMove = (puzzle: GradablePuzzle, moveUci: string): boolean =>
  moveUci === puzzle.bestMoveUci || puzzle.acceptableMovesUci.includes(moveUci)

/**
 * Whether `moveUci` can be played in the puzzle position. The contract only checks the move's shape,
 * so without this `a1a1` would be stored as an attempt — noise in the history the coach reads.
 */
export const isLegalMove = (puzzle: Pick<GradablePuzzle, 'fen'>, moveUci: string): boolean => {
  try {
    new Chess(puzzle.fen).move({
      from: moveUci.slice(0, 2),
      to: moveUci.slice(2, 4),
      ...(moveUci.length > 4 ? { promotion: moveUci.slice(4) } : {}),
    })
    return true
  } catch {
    return false
  }
}
