import { Chess, type Move, type Square } from 'chess.js'
import { useCallback, useState } from 'react'
import { type PieceCode } from './pieces/cburnett'

export type { Square }

export interface BoardPiece {
  code: PieceCode
  square: Square
}

/**
 * 8x8 grid of squares, rank-first. `board[0][0]` is a8 (top-left from white's POV);
 * `board[7][7]` is h1 (bottom-right). Empty squares are `null`.
 */
export type BoardGrid = (BoardPiece | null)[][]

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const

const squareName = (fileIdx: number, rankIdx: number): Square => {
  // rankIdx 0 (top row from white's POV) = rank 8; rankIdx 7 (bottom row) = rank 1
  const file = FILES[fileIdx]
  const rank = 8 - rankIdx
  return `${file}${rank}` as Square
}

const toBoardGrid = (chess: Chess): BoardGrid => {
  // chess.js's board() returns an 8x8 array where [0][0] is a8 and [7][7] is h1 — matches our
  // rank-first, white-on-bottom convention exactly.
  return chess.board().map((row, rankIdx) =>
    row.map((cell, fileIdx) => {
      if (!cell) return null
      const code: PieceCode = `${cell.color}${cell.type.toUpperCase()}` as PieceCode
      return { code, square: squareName(fileIdx, rankIdx) }
    }),
  )
}

export interface ChessGame {
  board: BoardGrid
  selectedSquare: Square | null
  legalDestinations: Square[]
  selectSquare: (sq: Square) => void
  attemptMove: (from: Square, to: Square) => boolean
  lastMoveSan: string | null
  /** Side to move next. */
  turn: 'w' | 'b'
  /** `true` when the side to move is in check (including checkmate). */
  isCheck: boolean
  isCheckmate: boolean
  /** Square of the king currently in check (or checkmated), else `null`. */
  checkedKingSquare: Square | null
  /** Human-readable result once the game has ended (checkmate, stalemate, draw), else `null`. */
  gameOverText: string | null
  /** Black pieces white has captured, sorted by piece value (pawns first). */
  capturedByWhite: PieceCode[]
  /** White pieces black has captured, sorted by piece value (pawns first). */
  capturedByBlack: PieceCode[]
}

const PIECE_VALUE: Record<string, number> = { p: 1, n: 2, b: 3, r: 4, q: 5 }

/** Pieces captured by `color`, from the verbose move history, sorted by piece value. */
const capturedPieces = (history: Move[], color: 'w' | 'b'): PieceCode[] => {
  const victimColor = color === 'w' ? 'b' : 'w'
  return history
    .filter((m) => m.color === color && m.captured)
    .map((m) => `${victimColor}${m.captured!.toUpperCase()}` as PieceCode)
    .sort((a, b) => PIECE_VALUE[a[1]!.toLowerCase()]! - PIECE_VALUE[b[1]!.toLowerCase()]!)
}

const findKingSquare = (board: BoardGrid, color: 'w' | 'b'): Square | null => {
  for (const row of board) {
    for (const cell of row) {
      if (cell?.code === `${color}K`) return cell.square
    }
  }
  return null
}

const toGameOverText = (chess: Chess): string | null => {
  if (chess.isCheckmate()) {
    return chess.turn() === 'w' ? 'Checkmate — black wins' : 'Checkmate — white wins'
  }
  if (chess.isStalemate()) return 'Stalemate'
  if (chess.isDraw()) return 'Draw'
  return null
}

/**
 * State container for a single chess game. Wraps `chess.js`; exposes a React-friendly view
 * of the board plus selection + move helpers. Both sides are played from the same board
 * (hotseat style) — `chess.js` enforces turn alternation and move legality.
 */
export const useChessGame = (): ChessGame => {
  const [chess] = useState(() => new Chess())
  const [, forceRender] = useState(0)
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null)

  const bump = useCallback(() => {
    forceRender((n) => n + 1)
  }, [])

  // `chess` is a stable ref (we mutate it in place). Memoizing the board on `[chess]` would
  // freeze it forever — `bump()` forces a re-render but the memo key never changes. Recomputing
  // 64 cells on every render is cheap, so we just do it inline.
  const board = toBoardGrid(chess)
  const history = chess.history({ verbose: true })
  const lastMoveSan = history.length > 0 ? history[history.length - 1]!.san : null

  const legalDestinations: Square[] = !selectedSquare
    ? []
    : chess.moves({ square: selectedSquare, verbose: true }).map((m) => m.to as Square)

  const selectSquare = useCallback(
    (sq: Square): void => {
      // If a square is already selected and the tap lands on a legal destination, treat the
      // second tap as a move attempt. Otherwise the tap selects (or deselects) a square.
      if (selectedSquare) {
        const legal = chess.moves({ square: selectedSquare, verbose: true }).some((m) => m.to === sq)
        if (legal) {
          chess.move({ from: selectedSquare, to: sq, promotion: 'q' })
          setSelectedSquare(null)
          bump()
          return
        }
      }

      const piece = chess.get(sq)
      if (piece && piece.color === chess.turn()) {
        setSelectedSquare(sq)
      } else {
        setSelectedSquare(null)
      }
    },
    [chess, selectedSquare, bump],
  )

  const attemptMove = useCallback(
    (from: Square, to: Square): boolean => {
      try {
        chess.move({ from, to, promotion: 'q' })
        setSelectedSquare(null)
        bump()
        return true
      } catch {
        return false
      }
    },
    [chess, bump],
  )

  // isCheck() is also true during checkmate, so this covers both.
  const isCheck = chess.isCheck()

  return {
    board,
    selectedSquare,
    legalDestinations,
    selectSquare,
    attemptMove,
    lastMoveSan,
    turn: chess.turn(),
    isCheck,
    isCheckmate: chess.isCheckmate(),
    checkedKingSquare: isCheck ? findKingSquare(board, chess.turn()) : null,
    gameOverText: toGameOverText(chess),
    capturedByWhite: capturedPieces(history, 'w'),
    capturedByBlack: capturedPieces(history, 'b'),
  }
}
