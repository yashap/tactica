export interface EvaluateRequest {
  fen: string
  movetimeMs: number
  multiPv: number
}

export class RequestValidationError extends Error {}

/**
 * Structural FEN check. Two jobs:
 *
 * 1. **Security.** A FEN is interpolated into the `position fen <fen>` UCI command, and UCI is a
 *    newline-delimited protocol — so a FEN containing a newline would let the caller append
 *    arbitrary engine commands. Anchored matching against this pattern makes that impossible.
 * 2. Catching obvious garbage early with a 400 instead of confusing the engine, which happily
 *    accepts nonsense and then reports no move.
 *
 * It is deliberately structural, not a legality check (no "exactly one king per side" etc.) — real
 * callers send chess.js-generated FENs, and the engine is the authority on the position anyway.
 */
export const isValidFen = (fen: string): boolean => {
  const ranks = fen.split(' ')[0]?.split('/')
  if (ranks === undefined || ranks.length !== 8) return false
  // Halfmove/fullmove counters are optional — Stockfish tolerates their absence
  return /^([1-8pnbrqkPNBRQK]+\/){7}[1-8pnbrqkPNBRQK]+ [wb] (-|[KQkq]{1,4}) (-|[a-h][1-8])( \d+){0,2}$/.test(fen)
}

export interface EvaluateRequestOptions {
  defaults: { movetimeMs: number; multiPv: number }
  limits: { maxMovetimeMs: number; maxMultiPv: number }
}

const parseBoundedInt = (value: unknown, name: string, fallback: number, max: number): number => {
  if (value === undefined || value === null) return fallback
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new RequestValidationError(`'${name}' must be an integer`)
  }
  if (value < 1 || value > max) {
    throw new RequestValidationError(`'${name}' must be between 1 and ${max}`)
  }
  return value
}

/** Validate and normalize an /evaluate body, applying configured defaults. */
export const parseEvaluateRequest = (body: unknown, options: EvaluateRequestOptions): EvaluateRequest => {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new RequestValidationError('Request body must be a JSON object')
  }
  const { fen, movetimeMs, multiPv } = body as Record<string, unknown>
  if (typeof fen !== 'string' || fen.length === 0) {
    throw new RequestValidationError("'fen' is required and must be a string")
  }
  if (!isValidFen(fen)) {
    throw new RequestValidationError("'fen' is not a valid FEN")
  }
  return {
    fen,
    movetimeMs: parseBoundedInt(movetimeMs, 'movetimeMs', options.defaults.movetimeMs, options.limits.maxMovetimeMs),
    multiPv: parseBoundedInt(multiPv, 'multiPv', options.defaults.multiPv, options.limits.maxMultiPv),
  }
}
