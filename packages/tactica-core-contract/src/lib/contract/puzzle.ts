import { ContractBuilder } from '@tactica/api-client-utils'
import { PaginationRequestSchema, PaginationResponseSchema } from '@tactica/pagination'
import { initContract } from '@ts-rest/core'
import { z } from 'zod'
import { ChessColorSchema } from './game.js'

const c = initContract()

/**
 * These shapes mirror `@tactica/tactica-analysis-contract` rather than importing from it. The
 * analysis service is an internal implementation detail — the app talks only to tactica-core, and
 * this contract is what the frontend depends on. Keeping them separate means we can change how
 * analysis reports things without breaking the public API, at the cost of a mapping step in the
 * `analyze-game` job.
 */

/** Evaluation of a position, **white-relative**. Exactly one of the two is set. */
export const EvaluationSchema = z.object({
  cp: z.number().int().optional(),
  /** Moves until mate; positive = white mates, negative = black mates. */
  mate: z.number().int().optional(),
})
export type Evaluation = z.infer<typeof EvaluationSchema>

export const EngineLineSchema = z.object({
  multipv: z.number().int().positive(),
  depth: z.number().int().nonnegative(),
  pvUci: z.array(z.string()),
  pvSan: z.array(z.string()),
  cp: z.number().int().optional(),
  mate: z.number().int().optional(),
})
export type EngineLine = z.infer<typeof EngineLineSchema>

export const PuzzleSeveritySchema = z.enum(['inaccuracy', 'mistake', 'blunder'])
export type PuzzleSeverity = z.infer<typeof PuzzleSeveritySchema>

export const PuzzleSchema = z.object({
  id: z.string().uuid(),
  userId: z.string(),
  gameId: z.string().uuid(),
  /** 0-based index of the mistake within the game. */
  ply: z.number().int().nonnegative(),
  /** The position to solve: immediately before the mistake, with the player to move. */
  fen: z.string(),
  /** Which colour the solver is playing — the board is oriented from here. */
  playerColor: ChessColorSchema,
  /** What they actually played in the game. */
  playedMoveUci: z.string(),
  playedMoveSan: z.string(),
  bestMoveUci: z.string(),
  bestMoveSan: z.string(),
  /** Moves accepted as correct: the best move plus anything near-equal to it. */
  acceptableMovesUci: z.array(z.string()),
  engineLines: z.array(EngineLineSchema),
  evalBefore: EvaluationSchema,
  evalAfter: EvaluationSchema,
  /** Win probability from the player's perspective, 0–1. */
  winProbBefore: z.number(),
  winProbAfter: z.number(),
  severity: PuzzleSeveritySchema,
  /** True once the user has played an accepted move at least once. */
  solved: z.boolean(),
  /** Context for the puzzle screen, denormalized from the game so the list needs one query. */
  opponentUsername: z.string(),
  playedAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})
export type Puzzle = z.infer<typeof PuzzleSchema>

export const PuzzleAttemptSchema = z.object({
  id: z.string().uuid(),
  puzzleId: z.string().uuid(),
  moveUci: z.string(),
  correct: z.boolean(),
  createdAt: z.string().datetime(),
})
export type PuzzleAttempt = z.infer<typeof PuzzleAttemptSchema>

export const CreatePuzzleAttemptRequestSchema = z.object({
  /** The move played, in UCI — including the promotion piece, e.g. `e7e8q`. */
  moveUci: z.string().regex(/^[a-h][1-8][a-h][1-8][qrbn]?$/, 'Must be a UCI move such as e2e4 or e7e8q'),
})
export type CreatePuzzleAttemptRequest = z.infer<typeof CreatePuzzleAttemptRequestSchema>

export const ListPuzzlesResponseSchema = z.object({
  data: z.array(PuzzleSchema),
  pagination: PaginationResponseSchema,
})

export const puzzleContract = c.router({
  list: {
    method: 'GET',
    path: '/puzzles',
    query: PaginationRequestSchema,
    responses: ContractBuilder.buildListResponses(ListPuzzlesResponseSchema),
    summary: 'List the authenticated user’s puzzles (paginated, newest first by default)',
  },
  get: {
    method: 'GET',
    path: '/puzzles/:id',
    pathParams: z.object({ id: z.string().uuid() }),
    responses: ContractBuilder.buildGetResponses(PuzzleSchema),
    summary: 'Get a single puzzle',
  },
  /**
   * The client already knows the answer (it ships in the puzzle, and these are the user's own
   * games — there's nothing to cheat at), so it grades locally for instant feedback. The server
   * grades again anyway, because that's what decides whether the puzzle counts as solved.
   */
  createAttempt: {
    method: 'POST',
    path: '/puzzles/:id/attempts',
    pathParams: z.object({ id: z.string().uuid() }),
    body: CreatePuzzleAttemptRequestSchema,
    responses: ContractBuilder.buildPostResponses(PuzzleAttemptSchema),
    summary: 'Record an attempt at a puzzle; the server decides whether it was correct',
  },
})
