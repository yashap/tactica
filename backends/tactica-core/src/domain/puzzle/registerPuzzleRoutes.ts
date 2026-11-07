import { InputValidationError } from '@tactica/errors'
import { getSessionUserId, tacticaRequestValidationErrorHandler } from '@tactica/fastify-utils'
import { buildPaginatedResponse, parsePagination } from '@tactica/pagination'
import { type Puzzle, tacticaCoreContract } from '@tactica/tactica-core-contract'
import { initServer } from '@ts-rest/fastify'
import type { FastifyInstance } from 'fastify'
import { isAcceptableMove, isLegalMove } from './puzzleGrading.js'
import { parsePuzzleOrdering, type PuzzleRepository, type SolvablePuzzle } from './PuzzleRepository.js'

export interface PuzzleRoutesDeps {
  puzzleRepository: PuzzleRepository
}

const toDto = (row: SolvablePuzzle): Puzzle => ({
  id: row.id,
  userId: row.userId,
  gameId: row.gameId,
  ply: row.ply,
  fen: row.fen,
  playerColor: row.playerColor,
  playedMoveUci: row.playedMoveUci,
  playedMoveSan: row.playedMoveSan,
  bestMoveUci: row.bestMoveUci,
  bestMoveSan: row.bestMoveSan,
  acceptableMovesUci: row.acceptableMovesUci,
  engineLines: row.engineLines,
  evalBefore: row.evalBefore,
  evalAfter: row.evalAfter,
  winProbBefore: row.winProbBefore,
  winProbAfter: row.winProbAfter,
  severity: row.severity,
  solved: row.solved,
  solvedFirstTry: row.solvedFirstTry,
  opponentUsername: row.opponentUsername,
  playedAt: row.playedAt.toISOString(),
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

export const registerPuzzleRoutes = async (app: FastifyInstance, deps: PuzzleRoutesDeps): Promise<void> => {
  const s = initServer()

  const router = s.router(tacticaCoreContract.puzzles, {
    list: async ({ query, request }) => {
      const userId = getSessionUserId(request)
      const pagination = parsePagination(query, parsePuzzleOrdering)
      const rows = await deps.puzzleRepository.list(userId, pagination)
      return { status: 200, body: buildPaginatedResponse(rows.map(toDto), pagination) }
    },
    get: async ({ params, request }) => {
      const userId = getSessionUserId(request)
      const row = await deps.puzzleRepository.findById(userId, params.id)
      if (!row) {
        return { status: 404, body: { message: 'Puzzle not found', code: 'NotFoundError' } }
      }
      return { status: 200, body: toDto(row) }
    },
    createAttempt: async ({ params, body, request }) => {
      const userId = getSessionUserId(request)
      const puzzle = await deps.puzzleRepository.findById(userId, params.id)
      if (!puzzle) {
        return { status: 404, body: { message: 'Puzzle not found', code: 'NotFoundError' } }
      }
      if (!isLegalMove(puzzle, body.moveUci)) {
        throw new InputValidationError(`${body.moveUci} is not a legal move in this puzzle`)
      }
      // Graded here rather than trusting the client's verdict: the client grades too, for instant
      // feedback, but this is what actually decides whether the puzzle counts as solved.
      const correct = isAcceptableMove(puzzle, body.moveUci)
      const attempt = await deps.puzzleRepository.createAttempt({
        userId,
        puzzleId: puzzle.id,
        moveUci: body.moveUci,
        correct,
      })
      return {
        status: 201,
        body: {
          id: attempt.id,
          puzzleId: attempt.puzzleId,
          moveUci: attempt.moveUci,
          correct: attempt.correct,
          createdAt: attempt.createdAt.toISOString(),
        },
      }
    },
  })

  await app.register(s.plugin(router), {
    requestValidationErrorHandler: tacticaRequestValidationErrorHandler,
  })
}
