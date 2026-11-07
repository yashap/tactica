import { describe, expect, it } from 'vitest'
import { isAcceptableMove, isLegalMove } from './puzzleGrading.js'

// After 1. e4 e5 2. Qh5 Nc6 — white to move; Qxf7+ was the blunder, Bc4 the fix
const HANGING_QUEEN = {
  fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/4P3/8/PPPP1PPP/RNB1KBNR w KQkq - 2 3',
  bestMoveUci: 'f1c4',
  acceptableMovesUci: ['f1c4', 'b1c3'],
}

// White pawn on h7: h8=Q# and h8=R# both mate; under-promoting to a knight or bishop doesn't
const PROMOTION = { fen: 'k7/7P/K7/8/8/8/8/8 w - - 0 1', bestMoveUci: 'h7h8q', acceptableMovesUci: ['h7h8q', 'h7h8r'] }

describe('isAcceptableMove', () => {
  it("accepts the engine's best move and its near-equal alternatives", () => {
    expect(isAcceptableMove(HANGING_QUEEN, 'f1c4')).toBe(true)
    expect(isAcceptableMove(HANGING_QUEEN, 'b1c3')).toBe(true)
  })

  it('rejects anything else, including the original blunder', () => {
    expect(isAcceptableMove(HANGING_QUEEN, 'h5f7')).toBe(false)
    expect(isAcceptableMove(HANGING_QUEEN, 'd2d4')).toBe(false)
  })

  it('grades a promotion by the piece chosen', () => {
    expect(isAcceptableMove(PROMOTION, 'h7h8q')).toBe(true)
    expect(isAcceptableMove(PROMOTION, 'h7h8r')).toBe(true)
    expect(isAcceptableMove(PROMOTION, 'h7h8n')).toBe(false)
  })
})

describe('isLegalMove', () => {
  it('accepts legal moves, right or wrong', () => {
    expect(isLegalMove(HANGING_QUEEN, 'f1c4')).toBe(true)
    expect(isLegalMove(HANGING_QUEEN, 'h5f7')).toBe(true)
    expect(isLegalMove(PROMOTION, 'h7h8n')).toBe(true)
  })

  it('rejects moves that are well-formed but impossible here', () => {
    expect(isLegalMove(HANGING_QUEEN, 'a1a1')).toBe(false)
    // A black move when it's white's turn
    expect(isLegalMove(HANGING_QUEEN, 'e8e7')).toBe(false)
    expect(isLegalMove(HANGING_QUEEN, 'e1g1')).toBe(false) // can't castle through pieces
  })
})
