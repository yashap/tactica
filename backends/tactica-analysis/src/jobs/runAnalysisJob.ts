import { getLogger } from '@tactica/logging'
import { analyzeGame } from '../domain/analyzeGame.js'
import { type AnalysisRepository } from '../domain/AnalysisRepository.js'
import { type StockfishEvaluator } from '../domain/StockfishClient.js'
import { type RunAnalysisPayload } from './jobQueue.js'

export interface RunAnalysisJobDeps {
  analysisRepository: AnalysisRepository
  engine: StockfishEvaluator
  defaults: { scanMovetimeMs: number; deepMovetimeMs: number; multiPv: number }
}

/**
 * The `run-analysis` job: evaluate a submitted game and store the result.
 *
 * Errors are recorded on the row *and* rethrown. The row is what the polling caller sees; the throw
 * is what lets pg-boss retry, which is worth having because the usual failure is the engine being
 * briefly unreachable. Re-running is safe — analysis is a pure function of the PGN, so a retry just
 * overwrites the same fields.
 */
export const buildRunAnalysisJob =
  (deps: RunAnalysisJobDeps) =>
  async (payload: RunAnalysisPayload): Promise<void> => {
    const logger = getLogger()
    const analysis = await deps.analysisRepository.findById(payload.analysisId)
    if (!analysis) {
      logger.warn('Skipping analysis that no longer exists', { analysisId: payload.analysisId })
      return
    }
    if (analysis.status === 'succeeded') {
      logger.info('Analysis already succeeded, nothing to do', { analysisId: analysis.id })
      return
    }

    await deps.analysisRepository.markRunning(analysis.id)
    try {
      const result = await analyzeGame(
        { engine: deps.engine },
        {
          pgn: analysis.pgn,
          playerColor: analysis.playerColor,
          scanMovetimeMs: analysis.settings?.scanMovetimeMs ?? deps.defaults.scanMovetimeMs,
          deepMovetimeMs: analysis.settings?.deepMovetimeMs ?? deps.defaults.deepMovetimeMs,
          multiPv: analysis.settings?.multiPv ?? deps.defaults.multiPv,
        },
      )
      await deps.analysisRepository.markSucceeded(analysis.id, result)
      logger.info('Analysis complete', { analysisId: analysis.id, blunders: result.blunders.length })
    } catch (error) {
      const message = (error as Error).message
      await deps.analysisRepository.markFailed(analysis.id, message)
      logger.error('Analysis failed', { analysisId: analysis.id, err: message })
      throw error
    }
  }
