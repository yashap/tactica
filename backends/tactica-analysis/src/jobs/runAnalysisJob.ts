import { InputValidationError } from '@tactica/errors'
import { getLogger } from '@tactica/logging'
import { analyzeGame } from '../domain/analyzeGame.js'
import { type AnalysisRepository } from '../domain/AnalysisRepository.js'
import { type StockfishEvaluator } from '../domain/StockfishClient.js'
import { type JobAttempt, type RunAnalysisPayload } from './jobQueue.js'

export interface RunAnalysisJobDeps {
  analysisRepository: AnalysisRepository
  engine: StockfishEvaluator
  defaults: { scanMovetimeMs: number; deepMovetimeMs: number; multiPv: number }
}

/**
 * The `run-analysis` job: evaluate a submitted game and store the result.
 *
 * On failure the row only becomes `failed` — which callers treat as final — once no retry is coming:
 * on the last attempt, or straight away for a PGN that can't be replayed, since retrying can't fix
 * that. Any other failure goes back to `queued` with the error noted, and is rethrown so pg-boss
 * retries it; the usual cause is the engine being briefly unreachable. Re-running is safe — analysis
 * is a pure function of the PGN, so a retry just overwrites the same fields.
 */
export const buildRunAnalysisJob =
  (deps: RunAnalysisJobDeps) =>
  async (payload: RunAnalysisPayload, attempt: JobAttempt): Promise<void> => {
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
        { engine: deps.engine, signal: attempt.signal },
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
      if (error instanceof InputValidationError) {
        await deps.analysisRepository.markFailed(analysis.id, message)
        logger.error('Analysis failed on bad input; not retrying', { analysisId: analysis.id, err: message })
        return
      }
      if (attempt.isFinalAttempt) {
        await deps.analysisRepository.markFailed(analysis.id, message)
        logger.error('Analysis failed on its final attempt', { analysisId: analysis.id, err: message })
      } else {
        await deps.analysisRepository.markRetryPending(analysis.id, message)
        logger.warn('Analysis attempt failed; pg-boss will retry', { analysisId: analysis.id, err: message })
      }
      throw error
    }
  }
