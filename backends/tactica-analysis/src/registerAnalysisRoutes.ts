import { CorrelationIdPropagator } from '@tactica/correlation-id-propagator'
import { tacticaRequestValidationErrorHandler } from '@tactica/fastify-utils'
import {
  type Analysis,
  tacticaAnalysisContract,
  tacticaAnalysisHealthContract,
} from '@tactica/tactica-analysis-contract'
import { initServer } from '@ts-rest/fastify'
import type { FastifyInstance } from 'fastify'
import { type AnalysisRow } from './db/schema.js'
import { type AnalysisRepository } from './domain/AnalysisRepository.js'
import { parsePgn } from './domain/analyzeGame.js'
import { type RunAnalysisPayload } from './jobs/jobQueue.js'

/** The slice of the job queue the routes use — narrow, so tests can supply a fake. */
export interface RunAnalysisEnqueuer {
  enqueueRunAnalysis(payload: RunAnalysisPayload): Promise<string | null>
}

export interface AnalysisRoutesDeps {
  analysisRepository: AnalysisRepository
  jobQueue: RunAnalysisEnqueuer
}

const toDto = (row: AnalysisRow): Analysis => ({
  id: row.id,
  status: row.status,
  playerColor: row.playerColor,
  result: row.result ?? null,
  error: row.error ?? null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
})

export const registerAnalysisRoutes = async (app: FastifyInstance, deps: AnalysisRoutesDeps): Promise<void> => {
  const s = initServer()

  /**
   * Queue a run for the row. If queuing fails, mark the row failed rather than leave it `queued`
   * forever with no job behind it; the caller's retry (same idempotency key) re-queues it.
   */
  const enqueue = async (row: AnalysisRow): Promise<void> => {
    try {
      await deps.jobQueue.enqueueRunAnalysis({
        analysisId: row.id,
        ...withCorrelationId(CorrelationIdPropagator.getContext()),
      })
    } catch (error) {
      await deps.analysisRepository.markFailed(row.id, `Could not queue analysis: ${(error as Error).message}`)
      throw error
    }
  }

  const router = s.router(tacticaAnalysisContract, {
    create: async ({ body }) => {
      // Reject a game we can't replay now, rather than queue it to fail on the worker
      parsePgn(body.pgn)

      const { analysis, created } = await deps.analysisRepository.createOrGet({
        pgn: body.pgn,
        playerColor: body.playerColor,
        ...(body.settings === undefined ? {} : { settings: body.settings }),
        ...(body.idempotencyKey === undefined ? {} : { idempotencyKey: body.idempotencyKey }),
      })
      if (created) {
        await enqueue(analysis)
        return { status: 201, body: toDto(analysis) }
      }
      // A resubmission. Anything still in flight or done is returned as-is for the caller to keep
      // polling; only a finally-failed analysis gets another go.
      if (analysis.status === 'failed') {
        const requeued = (await deps.analysisRepository.requeue(analysis.id)) ?? analysis
        await enqueue(requeued)
        return { status: 201, body: toDto(requeued) }
      }
      return { status: 201, body: toDto(analysis) }
    },
    get: async ({ params }) => {
      const row = await deps.analysisRepository.findById(params.id)
      if (!row) {
        return { status: 404, body: { message: 'Analysis not found', code: 'NotFoundError' } }
      }
      return { status: 200, body: toDto(row) }
    },
  })

  await app.register(s.plugin(router), {
    requestValidationErrorHandler: tacticaRequestValidationErrorHandler,
  })
}

const withCorrelationId = (correlationId: string | undefined): { correlationId?: string } =>
  correlationId === undefined ? {} : { correlationId }

/** Registered outside the internal-key gate so healthchecks and CI readiness waits stay simple. */
export const registerHealthRoutes = async (app: FastifyInstance): Promise<void> => {
  const s = initServer()
  const router = s.router(tacticaAnalysisHealthContract, {
    health: async () => ({ status: 200 as const, body: { status: 'ok' as const } }),
  })
  await app.register(s.plugin(router))
}
