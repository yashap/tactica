import { describe, expect, it } from 'vitest'
import { isValidFen, parseEvaluateRequest, RequestValidationError } from './evaluateRequest.js'

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
const MATE_IN_ONE_FEN = '6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1'

const options = {
  defaults: { movetimeMs: 100, multiPv: 1 },
  limits: { maxMovetimeMs: 60_000, maxMultiPv: 10 },
}

describe('isValidFen', () => {
  it('accepts realistic FENs', () => {
    expect(isValidFen(START_FEN)).toBe(true)
    expect(isValidFen(MATE_IN_ONE_FEN)).toBe(true)
    // Mid-game, partial castling rights, en-passant target
    expect(isValidFen('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b Kq e3 3 4')).toBe(true)
    // Counters are optional
    expect(isValidFen('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - -')).toBe(true)
  })

  it('rejects a FEN containing a newline, which would inject UCI commands', () => {
    // The whole point of validating: `position fen <fen>` is newline-delimited, so a newline here
    // would let a caller append arbitrary engine commands.
    expect(isValidFen(`${START_FEN}\nquit`)).toBe(false)
    expect(isValidFen(`${START_FEN}\ngo infinite`)).toBe(false)
    expect(isValidFen(`${START_FEN}\r\nquit`)).toBe(false)
  })

  it('rejects structurally broken FENs', () => {
    expect(isValidFen('')).toBe(false)
    expect(isValidFen('not a fen')).toBe(false)
    // Seven ranks
    expect(isValidFen('rnbqkbnr/pppppppp/8/8/8/8/RNBQKBNR w KQkq - 0 1')).toBe(false)
    // Nine ranks
    expect(isValidFen('rnbqkbnr/pppppppp/8/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(false)
    // Bad side to move
    expect(isValidFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1')).toBe(false)
    // Illegal piece letter
    expect(isValidFen('rnbqkbnr/ppppXppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1')).toBe(false)
    // Missing side to move
    expect(isValidFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR')).toBe(false)
    // Malformed en-passant square
    expect(isValidFen('6k1/5ppp/8/8/8/8/5PPP/R5K1 w - e9 0 1')).toBe(false)
  })
})

describe('parseEvaluateRequest', () => {
  it('applies defaults when optional fields are omitted', () => {
    expect(parseEvaluateRequest({ fen: START_FEN }, options)).toEqual({
      fen: START_FEN,
      movetimeMs: 100,
      multiPv: 1,
    })
  })

  it('passes through valid explicit values', () => {
    expect(parseEvaluateRequest({ fen: START_FEN, movetimeMs: 1500, multiPv: 3 }, options)).toEqual({
      fen: START_FEN,
      movetimeMs: 1500,
      multiPv: 3,
    })
  })

  it('rejects a missing or non-string fen', () => {
    expect(() => parseEvaluateRequest({}, options)).toThrow(RequestValidationError)
    expect(() => parseEvaluateRequest({ fen: '' }, options)).toThrow(/'fen' is required/)
    expect(() => parseEvaluateRequest({ fen: 42 }, options)).toThrow(/'fen' is required/)
  })

  it('rejects an invalid fen', () => {
    expect(() => parseEvaluateRequest({ fen: 'garbage' }, options)).toThrow(/not a valid FEN/)
  })

  it('rejects non-object bodies', () => {
    expect(() => parseEvaluateRequest(null, options)).toThrow(/must be a JSON object/)
    expect(() => parseEvaluateRequest('string', options)).toThrow(/must be a JSON object/)
    expect(() => parseEvaluateRequest([{ fen: START_FEN }], options)).toThrow(/must be a JSON object/)
  })

  it('rejects out-of-range and non-integer numbers', () => {
    expect(() => parseEvaluateRequest({ fen: START_FEN, movetimeMs: 0 }, options)).toThrow(/between 1 and 60000/)
    expect(() => parseEvaluateRequest({ fen: START_FEN, movetimeMs: 60_001 }, options)).toThrow(/between 1 and 60000/)
    expect(() => parseEvaluateRequest({ fen: START_FEN, movetimeMs: 12.5 }, options)).toThrow(/must be an integer/)
    expect(() => parseEvaluateRequest({ fen: START_FEN, movetimeMs: '100' }, options)).toThrow(/must be an integer/)
    expect(() => parseEvaluateRequest({ fen: START_FEN, multiPv: 11 }, options)).toThrow(/between 1 and 10/)
    expect(() => parseEvaluateRequest({ fen: START_FEN, multiPv: 0 }, options)).toThrow(/between 1 and 10/)
  })

  it('treats null like an omitted value', () => {
    expect(parseEvaluateRequest({ fen: START_FEN, movetimeMs: null, multiPv: null }, options)).toEqual({
      fen: START_FEN,
      movetimeMs: 100,
      multiPv: 1,
    })
  })
})
