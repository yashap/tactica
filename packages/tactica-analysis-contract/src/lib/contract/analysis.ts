import { ContractBuilder, ServerErrorSchema } from '@tactica/api-client-utils'
import { initContract } from '@ts-rest/core'
import { z } from 'zod'

const c = initContract()

/**
 * Deliberately re-declared rather than imported from `@tactica/tactica-core-contract`: these are
 * independent services and this contract shouldn't drag in core's whole API surface. The string
 * values match, which is the part that has to agree over the wire.
 */
export const ChessColorSchema = z.enum(['white', 'black'])
export type ChessColor = z.infer<typeof ChessColorSchema>

export const AnalysisStatusSchema = z.enum(['queued', 'running', 'succeeded', 'failed'])
export type AnalysisStatus = z.infer<typeof AnalysisStatusSchema>

/** How badly a move damaged the player's position, by win-probability drop. */
export const BlunderSeveritySchema = z.enum(['inaccuracy', 'mistake', 'blunder'])
export type BlunderSeverity = z.infer<typeof BlunderSeveritySchema>

/**
 * A position evaluation. `cp`/`mate` are **white-relative** everywhere in this contract — the engine
 * reports side-to-move-relative, and this service normalizes before handing anything back, so
 * consumers never have to know whose turn it was. Exactly one of the two is set.
 */
export const EvaluationSchema = z.object({
  cp: z.number().int().optional(),
  /** Moves until mate; positive = white mates, negative = black mates. */
  mate: z.number().int().optional(),
})
export type Evaluation = z.infer<typeof EvaluationSchema>

/** Evaluation of the position *before* the given ply, white-relative. Suitable for an eval graph. */
export const MoveEvalSchema = EvaluationSchema.extend({
  ply: z.number().int().nonnegative(),
})
export type MoveEval = z.infer<typeof MoveEvalSchema>

export const EngineLineSchema = z.object({
  /** 1-based rank; 1 is the engine's preferred line. */
  multipv: z.number().int().positive(),
  depth: z.number().int().nonnegative(),
  pvUci: z.array(z.string()),
  /** Same line in SAN, ready to show a human (or feed the coach) without re-deriving it. */
  pvSan: z.array(z.string()),
  cp: z.number().int().optional(),
  mate: z.number().int().optional(),
})
export type EngineLine = z.infer<typeof EngineLineSchema>

export const BlunderSchema = z.object({
  /** 0-based index of the player's move within the game. */
  ply: z.number().int().nonnegative(),
  /** Position *before* the mistake, with the player to move — this is the puzzle. */
  fen: z.string(),
  playedMoveUci: z.string(),
  playedMoveSan: z.string(),
  bestMoveUci: z.string(),
  bestMoveSan: z.string(),
  /**
   * Moves that are as good as the best move within a small win-probability margin. A puzzle should
   * accept any of these, since "the" best move is often one of several equally winning ideas.
   */
  acceptableMovesUci: z.array(z.string()),
  /** Top lines from the deep pass; the coach's grounding for explaining the position. */
  engineLines: z.array(EngineLineSchema),
  /** White-relative evals before and after the played move. */
  evalBefore: EvaluationSchema,
  evalAfter: EvaluationSchema,
  /** Win probability **from the player's perspective**, 0–1. The drop between them is the damage. */
  winProbBefore: z.number(),
  winProbAfter: z.number(),
  severity: BlunderSeveritySchema,
})
export type Blunder = z.infer<typeof BlunderSchema>

export const AnalysisResultSchema = z.object({
  moveEvals: z.array(MoveEvalSchema),
  blunders: z.array(BlunderSchema),
})
export type AnalysisResult = z.infer<typeof AnalysisResultSchema>

/** Per-request overrides for the search budget. Omitted values fall back to the service's env config. */
export const AnalysisSettingsSchema = z.object({
  scanMovetimeMs: z.number().int().min(1).max(10_000).optional(),
  deepMovetimeMs: z.number().int().min(1).max(60_000).optional(),
  multiPv: z.number().int().min(1).max(10).optional(),
})
export type AnalysisSettings = z.infer<typeof AnalysisSettingsSchema>

export const AnalysisSchema = z.object({
  id: z.string().uuid(),
  status: AnalysisStatusSchema,
  playerColor: ChessColorSchema,
  /** Present once `status` is `succeeded`. */
  result: AnalysisResultSchema.nullable(),
  /** Present once `status` is `failed`. */
  error: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Analysis = z.infer<typeof AnalysisSchema>

export const CreateAnalysisRequestSchema = z.object({
  pgn: z.string().min(1),
  /** Whose mistakes we're looking for. */
  playerColor: ChessColorSchema,
  settings: AnalysisSettingsSchema.optional(),
})
export type CreateAnalysisRequest = z.infer<typeof CreateAnalysisRequestSchema>

export const HealthResponseSchema = z.object({ status: z.literal('ok') })
export type HealthResponse = z.infer<typeof HealthResponseSchema>

export const tacticaAnalysisContract = c.router(
  {
    /**
     * Submitting returns immediately with `status: 'queued'` — a full game is seconds of engine time,
     * far too long to hold a request open. Poll `get` until the status is terminal.
     */
    create: {
      method: 'POST',
      path: '/analyses',
      body: CreateAnalysisRequestSchema,
      responses: ContractBuilder.buildPostResponses(AnalysisSchema),
      summary: 'Queue a game for blunder analysis',
    },
    get: {
      method: 'GET',
      path: '/analyses/:id',
      pathParams: z.object({ id: z.string().uuid() }),
      responses: ContractBuilder.buildGetResponses(AnalysisSchema),
      summary: 'Fetch an analysis, including its result once it has succeeded',
    },
  },
  { pathPrefix: '/tactica-analysis' },
)

/** Unauthenticated, and outside the `/tactica-analysis` prefix so healthchecks stay dead simple. */
export const tacticaAnalysisHealthContract = c.router({
  health: {
    method: 'GET',
    path: '/health',
    responses: { 200: HealthResponseSchema, 500: ServerErrorSchema },
    summary: 'Liveness check',
  },
})
