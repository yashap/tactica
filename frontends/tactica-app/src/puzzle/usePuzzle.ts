import { type Puzzle } from '@tactica/tactica-core-contract'
import { useEffect, useMemo, useRef, useState } from 'react'
import { type ChessGame, type Square, useChessGame } from '../chess/useChessGame'

export type PuzzleOutcome = 'unsolved' | 'correct' | 'incorrect'

export interface PuzzleSession {
  game: ChessGame
  outcome: PuzzleOutcome
  /** What the user played, once they've played something. */
  attemptedMoveUci: string | null
  /** The same move in SAN, for showing back to them. */
  attemptedMoveSan: string | null
  /** Board orientation: the solver's colour sits at the bottom. */
  orientation: 'white' | 'black'
}

const OPPONENT_REPLY_DELAY_MS = 600

type PromotionPiece = 'q' | 'r' | 'b' | 'n'

/**
 * The opponent's reply to the solver's move: the second move of the engine line that starts with it.
 * Each accepted alternative is the first move of its own line, so replying from the top line would
 * answer a move the solver didn't play. `undefined` when no line covers the move (or it ends there).
 */
export const replyTo = (puzzle: Puzzle, moveUci: string): string | undefined =>
  puzzle.engineLines.find((line) => line.pvUci[0] === moveUci)?.pvUci[1]

/**
 * Runs one puzzle: load the position, let the solver make exactly one move, and grade it.
 *
 * Grading happens locally for instant feedback. That's safe because a puzzle carries its own answer
 * and these are the user's own games — there is nothing to cheat at. The server grades the attempt
 * again anyway, and its verdict is what marks the puzzle solved.
 *
 * Once graded the board locks: the puzzle is one move, and further moves would be ungraded noise.
 *
 * There is no `retry` here on purpose: the board's position is fixed when the hook mounts, so
 * retrying means remounting. The screen does that with a `key`, which also guarantees no state from
 * the previous attempt can survive.
 */
export const usePuzzle = (
  puzzle: Puzzle | undefined,
  options: { onAttempt?: (moveUci: string) => void } = {},
): PuzzleSession => {
  const [outcome, setOutcome] = useState<PuzzleOutcome>('unsolved')
  const [attempted, setAttempted] = useState<{ uci: string; san: string | null } | null>(null)
  const graded = useRef(false)
  const replied = useRef(false)
  const onAttempt = useRef(options.onAttempt)
  onAttempt.current = options.onAttempt

  const game = useChessGame({
    ...(puzzle ? { initialFen: puzzle.fen } : {}),
    interactiveColor: puzzle?.playerColor === 'black' ? 'b' : 'w',
    // Under-promotion is occasionally the answer, so never silently queen in a puzzle
    askForPromotion: true,
    readOnly: outcome !== 'unsolved',
  })
  // `game` is a fresh object every render; the reply effect reads it through a ref so re-renders
  // don't keep cancelling and re-arming its timer
  const gameRef = useRef(game)
  gameRef.current = game
  // Likewise the puzzle: recording the attempt refetches it as a new object with the same content
  const puzzleRef = useRef(puzzle)
  puzzleRef.current = puzzle

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
    setAttempted({ uci: moveUci, san: game.lastMoveSan })
    setOutcome(acceptable.has(moveUci) ? 'correct' : 'incorrect')
    onAttempt.current?.(moveUci)
  }, [game.lastMoveUci, game.lastMoveSan, puzzle, acceptable])

  // After a correct move, play the opponent's reply from that move's own line, so the idea resolves
  // visibly rather than leaving the board frozen mid-thought. Once only.
  const attemptedMoveUci = attempted?.uci ?? null
  const puzzleId = puzzle?.id
  useEffect(() => {
    const current = puzzleRef.current
    if (outcome !== 'correct' || !current || !attemptedMoveUci || replied.current) return
    const reply = replyTo(current, attemptedMoveUci)
    if (reply === undefined) return
    const timer = setTimeout(() => {
      replied.current = true
      gameRef.current.attemptMove(
        reply.slice(0, 2) as Square,
        reply.slice(2, 4) as Square,
        (reply[4] as PromotionPiece | undefined) ?? 'q',
      )
    }, OPPONENT_REPLY_DELAY_MS)
    return () => {
      clearTimeout(timer)
    }
  }, [outcome, puzzleId, attemptedMoveUci])

  return {
    game,
    outcome,
    attemptedMoveUci,
    attemptedMoveSan: attempted?.san ?? null,
    orientation: puzzle?.playerColor ?? 'white',
  }
}
