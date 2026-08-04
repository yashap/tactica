import { ServerErrorSchema } from '@tactica/api-client-utils'
import { initContract } from '@ts-rest/core'
import { z } from 'zod'

const c = initContract()

/**
 * Structural FEN pattern. This is a **security boundary**, not just input hygiene: the FEN is
 * interpolated into the newline-delimited UCI command `position fen <fen>`, so a FEN containing a
 * newline could append arbitrary engine commands. Being anchored with no whitespace class beyond
 * single spaces, this pattern cannot match one.
 *
 * Deliberately structural rather than a legality check (no "exactly one king per side") — callers
 * send chess.js-generated FENs, and the engine is the authority on the position anyway. Halfmove and
 * fullmove counters are optional; Stockfish tolerates their absence.
 */
export const FEN_PATTERN =
  /^([1-8pnbrqkPNBRQK]+\/){7}[1-8pnbrqkPNBRQK]+ [wb] (-|[KQkq]{1,4}) (-|[a-h][1-8])( \d+){0,2}$/

// The pattern already pins the rank count (7 separators + a final rank) and, being anchored, rejects
// anything trailing — so one check covers structure, rank count and the newline case.
export const FenSchema = z.string().refine((fen) => FEN_PATTERN.test(fen), { message: 'Not a valid FEN' })

export const EngineLineSchema = z.object({
  /** 1-based principal-variation rank; 1 is the engine's preferred line. */
  multipv: z.number().int().positive(),
  depth: z.number().int().nonnegative(),
  /** The line's moves in UCI notation; the first is the move to play. */
  pvUci: z.array(z.string()).min(1),
  /**
   * Centipawns **from the perspective of the side to move in the evaluated position** — that is what
   * UCI reports and it is deliberately not normalized. Absent when `mate` is set.
   */
  cp: z.number().int().optional(),
  /** Moves until mate, side-to-move-relative: positive = delivering mate, negative = being mated. */
  mate: z.number().int().optional(),
})
export type EngineLine = z.infer<typeof EngineLineSchema>

export const EvaluateRequestSchema = z.object({
  fen: FenSchema,
  movetimeMs: z.number().int().min(1).max(60_000).default(100),
  multiPv: z.number().int().min(1).max(10).default(1),
})
export type EvaluateRequest = z.infer<typeof EvaluateRequestSchema>

export const EvaluateResponseSchema = z.object({
  /** `null` for an already-terminal position (checkmate or stalemate). */
  bestMoveUci: z.string().nullable(),
  /** Best-first; one entry per requested PV rank (fewer if the position has fewer legal moves). */
  lines: z.array(EngineLineSchema),
})
export type EvaluateResponse = z.infer<typeof EvaluateResponseSchema>

export const HealthResponseSchema = z.object({
  status: z.literal('ok'),
  engineRunning: z.boolean(),
})
export type HealthResponse = z.infer<typeof HealthResponseSchema>

export const stockfishContract = c.router({
  health: {
    method: 'GET',
    path: '/health',
    responses: {
      200: HealthResponseSchema,
      500: ServerErrorSchema,
    },
    summary: 'Liveness check, including whether the engine process is currently up',
  },
  evaluate: {
    method: 'POST',
    path: '/evaluate',
    body: EvaluateRequestSchema,
    // Hand-written rather than via ContractBuilder: this is a 200-returning POST (it computes
    // rather than creates) and it needs a 504 for a wedged engine, neither of which the shared
    // helpers cover.
    responses: {
      200: EvaluateResponseSchema,
      400: ServerErrorSchema,
      500: ServerErrorSchema,
      504: ServerErrorSchema,
    },
    summary: 'Evaluate a position and return the engine’s best move plus its top lines',
  },
})
