import { describe, expect, it } from 'vitest'
import { EvaluateRequestSchema, FenSchema } from './evaluate.js'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const MATE_IN_ONE_FEN = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'

describe('FenSchema', () => {
  it('accepts realistic FENs', () => {
    expect(FenSchema.safeParse(START_FEN).success).toBe(true)
    expect(FenSchema.safeParse(MATE_IN_ONE_FEN).success).toBe(true)
    // Mid-game, partial castling rights, en-passant target
    expect(FenSchema.safeParse('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b Kq e3 3 4').success).toBe(true)
    // Counters are optional
    expect(FenSchema.safeParse('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - -').success).toBe(true)
  })

  it('rejects a FEN containing a newline, which would inject UCI commands', () => {
    // The security-relevant case: `position fen <fen>` is newline-delimited, so a newline here
    // would let a caller append arbitrary engine commands.
    expect(FenSchema.safeParse(`${START_FEN}\nquit`).success).toBe(false)
    expect(FenSchema.safeParse(`${START_FEN}\ngo infinite`).success).toBe(false)
    expect(FenSchema.safeParse(`${START_FEN}\r\nquit`).success).toBe(false)
  })

  it('rejects structurally broken FENs', () => {
    expect(FenSchema.safeParse('').success).toBe(false)
    expect(FenSchema.safeParse('not a fen').success).toBe(false)
    // Seven ranks
    expect(FenSchema.safeParse('rnbqkbnr/pppppppp/8/8/8/8/RNBQKBNR w KQkq - 0 1').success).toBe(false)
    // Nine ranks
    expect(FenSchema.safeParse('rnbqkbnr/pppppppp/8/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1').success).toBe(false)
    // Bad side to move
    expect(FenSchema.safeParse('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1').success).toBe(false)
    // Illegal piece letter
    expect(FenSchema.safeParse('rnbqkbnr/ppppXppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1').success).toBe(false)
    // Missing side to move
    expect(FenSchema.safeParse('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR').success).toBe(false)
    // Malformed en-passant square
    expect(FenSchema.safeParse('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - e9 0 1').success).toBe(false)
  })
})

describe('EvaluateRequestSchema', () => {
  it('applies defaults when optional fields are omitted', () => {
    expect(EvaluateRequestSchema.parse({ fen: START_FEN })).toEqual({
      fen: START_FEN,
      movetimeMs: 100,
      multiPv: 1,
    })
  })

  it('passes through valid explicit values', () => {
    expect(EvaluateRequestSchema.parse({ fen: START_FEN, movetimeMs: 1500, multiPv: 3 })).toEqual({
      fen: START_FEN,
      movetimeMs: 1500,
      multiPv: 3,
    })
  })

  it('rejects a missing or non-string fen', () => {
    expect(EvaluateRequestSchema.safeParse({}).success).toBe(false)
    expect(EvaluateRequestSchema.safeParse({ fen: '' }).success).toBe(false)
    expect(EvaluateRequestSchema.safeParse({ fen: 42 }).success).toBe(false)
  })

  it('rejects an invalid fen', () => {
    expect(EvaluateRequestSchema.safeParse({ fen: 'garbage' }).success).toBe(false)
  })

  it('rejects out-of-range and non-integer numbers', () => {
    expect(EvaluateRequestSchema.safeParse({ fen: START_FEN, movetimeMs: 0 }).success).toBe(false)
    expect(EvaluateRequestSchema.safeParse({ fen: START_FEN, movetimeMs: 60_001 }).success).toBe(false)
    expect(EvaluateRequestSchema.safeParse({ fen: START_FEN, movetimeMs: 12.5 }).success).toBe(false)
    expect(EvaluateRequestSchema.safeParse({ fen: START_FEN, movetimeMs: '100' }).success).toBe(false)
    expect(EvaluateRequestSchema.safeParse({ fen: START_FEN, multiPv: 11 }).success).toBe(false)
    expect(EvaluateRequestSchema.safeParse({ fen: START_FEN, multiPv: 0 }).success).toBe(false)
  })
})
