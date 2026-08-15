import { getLogger } from '@tactica/logging'
import { type Analysis, type Blunder } from '@tactica/tactica-analysis-contract'
import { type TacticaAnalysisClient } from '@tactica/tactica-analysis-client'
import { type NewPuzzleRow } from '../db/schema.js'
import { type GameRepository } from '../domain/game/GameRepository.js'
import { type PuzzleRepository } from '../domain/puzzle/PuzzleRepository.js'
import { type AnalyzeGamePayload } from './jobQueue.js'

export interface AnalyzeGameJobDeps {
  gameRepository: GameRepository
  puzzleRepository: PuzzleRepository
  analysisClient: TacticaAnalysisClient
  /** How often to ask the analysis service whether it's done. */
  pollIntervalMs: number
  /** Give up (and let pg-boss retry) after this long. */
  pollTimeoutMs: number
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

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
 */
export const buildAnalyzeGameJob =
  (deps: AnalyzeGameJobDeps) =>
  async (payload: AnalyzeGamePayload): Promise<void> => {
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
      })

      const deadline = Date.now() + deps.pollTimeoutMs
      let analysis = submitted
      while (!isTerminal(analysis)) {
        if (Date.now() > deadline) {
          throw new Error(`Analysis ${analysis.id} did not finish within ${deps.pollTimeoutMs}ms`)
        }
        await sleep(deps.pollIntervalMs)
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
      // Record it so the UI stops showing this game as in-flight, then rethrow so pg-boss retries.
      await deps.gameRepository.setAnalysisStatus(game.userId, game.id, 'failed')
      logger.error('Failed to analyze game', { gameId: game.id, err: (error as Error).message })
      throw error
    }
  }
