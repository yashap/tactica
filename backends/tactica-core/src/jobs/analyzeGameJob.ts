import { getLogger } from '@tactica/logging'
import { type Analysis, type Blunder } from '@tactica/tactica-analysis-contract'
import { type TacticaAnalysisClient } from '@tactica/tactica-analysis-client'
import { type NewPuzzleRow } from '../db/schema.js'
import { type GameRepository } from '../domain/game/GameRepository.js'
import { type PuzzleRepository } from '../domain/puzzle/PuzzleRepository.js'
import { type AnalyzeGamePayload, type JobAttempt } from './jobQueue.js'

export interface AnalyzeGameJobDeps {
  gameRepository: GameRepository
  puzzleRepository: PuzzleRepository
  analysisClient: TacticaAnalysisClient
  /** How often to ask the analysis service whether it's done. */
  pollIntervalMs: number
  /** Give up (and let pg-boss retry) after this long. */
  pollTimeoutMs: number
}

/** Wait, unless the job is abandoned first — then stop polling rather than hold the worker. */
const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error('Analysis job was aborted'))
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      reject(new Error('Analysis job was aborted'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })

const isTerminal = (analysis: Analysis): boolean => analysis.status === 'succeeded' || analysis.status === 'failed'

/**
 * Map the analysis service's blunder onto our own puzzle row. The two shapes are deliberately
 * separate — analysis is an internal detail, and this is where a change over there gets absorbed
 * instead of leaking into the app's API.
 */
const toPuzzleRow = (
  blunder: Blunder,
  game: { id: string; userId: string; userColor: 'white' | 'black' },
): NewPuzzleRow => ({
  userId: game.userId,
  gameId: game.id,
  ply: blunder.ply,
  fen: blunder.fen,
  playerColor: game.userColor,
  playedMoveUci: blunder.playedMoveUci,
  playedMoveSan: blunder.playedMoveSan,
  bestMoveUci: blunder.bestMoveUci,
  bestMoveSan: blunder.bestMoveSan,
  acceptableMovesUci: blunder.acceptableMovesUci,
  engineLines: blunder.engineLines,
  evalBefore: blunder.evalBefore,
  evalAfter: blunder.evalAfter,
  winProbBefore: blunder.winProbBefore,
  winProbAfter: blunder.winProbAfter,
  severity: blunder.severity,
})

/**
 * The `analyze-game` job: hand a game's PGN to the analysis service, wait for it, and turn the
 * mistakes it finds into puzzles.
 *
 * Polling rather than callbacks, because a full game is seconds of engine time and the alternative
 * (analysis calling us back) would mean exposing an endpoint and dealing with retries in both
 * directions. Everything here is idempotent: puzzle inserts dedupe on `(gameId, ply)`, so a retry
 * after a partial failure just fills in what's missing.
 *
 * Submission carries the game id as an idempotency key, so a retry (after a poll timeout, say)
 * resumes polling the analysis already under way instead of queuing the game a second time on the
 * single-slot engine.
 *
 * A failure only marks the game `failed` on the final attempt. Before that it goes back to `pending`:
 * the app treats `failed` as settled, and would otherwise stop polling during the retry window and
 * miss the puzzles a successful retry produces.
 */
export const buildAnalyzeGameJob =
  (deps: AnalyzeGameJobDeps) =>
  async (payload: AnalyzeGamePayload, attempt: JobAttempt): Promise<void> => {
    const logger = getLogger()
    const game = await deps.gameRepository.findById(payload.userId, payload.gameId)
    if (!game) {
      logger.warn('Skipping analysis for a game that no longer exists', { gameId: payload.gameId })
      return
    }
    if (game.analysisStatus === 'analyzed') {
      logger.info('Game already analyzed, nothing to do', { gameId: game.id })
      return
    }

    await deps.gameRepository.setAnalysisStatus(game.userId, game.id, 'analyzing')
    try {
      const submitted = await deps.analysisClient.create({
        pgn: game.pgn,
        playerColor: game.userColor,
        idempotencyKey: game.id,
      })

      const deadline = Date.now() + deps.pollTimeoutMs
      let analysis = submitted
      while (!isTerminal(analysis)) {
        if (Date.now() > deadline) {
          throw new Error(`Analysis ${analysis.id} did not finish within ${deps.pollTimeoutMs}ms`)
        }
        await sleep(deps.pollIntervalMs, attempt.signal)
        const polled = await deps.analysisClient.get(analysis.id)
        if (!polled) {
          throw new Error(`Analysis ${analysis.id} disappeared while we were waiting for it`)
        }
        analysis = polled
      }

      if (analysis.status === 'failed' || !analysis.result) {
        throw new Error(`Analysis failed: ${analysis.error ?? 'no result returned'}`)
      }

      const puzzles = analysis.result.blunders.map((blunder) => toPuzzleRow(blunder, game))
      const inserted = await deps.puzzleRepository.insertMany(puzzles)
      await deps.gameRepository.setAnalysisStatus(game.userId, game.id, 'analyzed', analysis.result.moveEvals)

      logger.info('Analyzed game', {
        gameId: game.id,
        blunders: analysis.result.blunders.length,
        puzzlesInserted: inserted,
      })
    } catch (error) {
      const err = (error as Error).message
      if (attempt.isFinalAttempt) {
        // Settled: the UI stops counting this game as in flight and reports it as failed
        await deps.gameRepository.setAnalysisStatus(game.userId, game.id, 'failed')
        logger.error('Failed to analyze game on its final attempt', { gameId: game.id, err })
      } else {
        await deps.gameRepository.setAnalysisStatus(game.userId, game.id, 'pending')
        logger.warn('Analysis attempt failed; pg-boss will retry', { gameId: game.id, err })
      }
      throw error
    }
  }
