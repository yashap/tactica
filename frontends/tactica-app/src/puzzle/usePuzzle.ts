import { type Puzzle } from '@tactica/tactica-core-contract'
import { useEffect, useMemo, useRef, useState } from 'react'
import { type ChessGame, type Square, useChessGame } from '../chess/useChessGame'

export type PuzzleOutcome = 'unsolved' | 'correct' | 'incorrect'

export interface PuzzleSession {
  game: ChessGame
  outcome: PuzzleOutcome
  /** What the user played, once they've played something. */
  attemptedMoveUci: string | null
  /** Board orientation: the solver's colour sits at the bottom. */
  orientation: 'white' | 'black'
}

const OPPONENT_REPLY_DELAY_MS = 600

/**
 * Runs one puzzle: load the position, let the solver make exactly one move, and grade it.
 *
 * Grading happens locally for instant feedback. That's safe because a puzzle carries its own answer
 * and these are the user's own games — there is nothing to cheat at. The server grades the attempt
 * again anyway, and its verdict is what marks the puzzle solved.
 *
 * There is no `retry` here on purpose: the board's position is fixed when the hook mounts, so
 * retrying means remounting. The screen does that with a `key`, which also guarantees no state from
 * the previous attempt can survive.
 */
export const usePuzzle = (
  puzzle: Puzzle | undefined,
  options: { onAttempt?: (moveUci: string, correct: boolean) => void } = {},
): PuzzleSession => {
  const [outcome, setOutcome] = useState<PuzzleOutcome>('unsolved')
  const [attemptedMoveUci, setAttemptedMoveUci] = useState<string | null>(null)
  const graded = useRef(false)
  const onAttempt = useRef(options.onAttempt)
  onAttempt.current = options.onAttempt

  const game = useChessGame({
    ...(puzzle ? { initialFen: puzzle.fen } : {}),
    interactiveColor: puzzle?.playerColor === 'black' ? 'b' : 'w',
    // Under-promotion is occasionally the answer, so never silently queen in a puzzle
    askForPromotion: true,
  })

  const acceptable = useMemo(() => {
    const moves = puzzle ? [puzzle.bestMoveUci, ...puzzle.acceptableMovesUci] : []
    return new Set(moves)
  }, [puzzle])

  // Grade the solver's move the moment it lands on the board
  useEffect(() => {
    if (!puzzle || graded.current) return
    const moveUci = game.lastMoveUci
    if (!moveUci) return
    graded.current = true
    const correct = acceptable.has(moveUci)
    setAttemptedMoveUci(moveUci)
    setOutcome(correct ? 'correct' : 'incorrect')
    onAttempt.current?.(moveUci, correct)
  }, [game.lastMoveUci, puzzle, acceptable])

  // After a correct move, play the engine's expected reply so the line resolves visibly rather than
  // leaving the board frozen mid-idea.
  useEffect(() => {
    if (outcome !== 'correct') return
    const reply = puzzle?.engineLines[0]?.pvUci[1]
    if (reply === undefined) return
    const timer = setTimeout(() => {
      game.attemptMove(reply.slice(0, 2) as Square, reply.slice(2, 4) as Square)
    }, OPPONENT_REPLY_DELAY_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [outcome, puzzle, game])

  return {
    game,
    outcome,
    attemptedMoveUci,
    orientation: puzzle?.playerColor ?? 'white',
  }
}
