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
import { type JobQueue } from './jobs/jobQueue.js'

export interface AnalysisRoutesDeps {
  analysisRepository: AnalysisRepository
  jobQueue: JobQueue
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

  const router = s.router(tacticaAnalysisContract, {
    create: async ({ body }) => {
      const row = await deps.analysisRepository.create({
        pgn: body.pgn,
        playerColor: body.playerColor,
        ...(body.settings === undefined ? {} : { settings: body.settings }),
      })
      await deps.jobQueue.enqueueRunAnalysis({ analysisId: row.id })
      return { status: 201, body: toDto(row) }
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

/** Registered outside the internal-key gate so healthchecks and CI readiness waits stay simple. */
export const registerHealthRoutes = async (app: FastifyInstance): Promise<void> => {
  const s = initServer()
  const router = s.router(tacticaAnalysisHealthContract, {
    health: async () => ({ status: 200 as const, body: { status: 'ok' as const } }),
  })
  await app.register(s.plugin(router))
}
