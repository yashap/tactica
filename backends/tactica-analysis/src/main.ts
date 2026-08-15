import { buildRequireInternalApiKey, FastifyAppBuilder } from '@tactica/fastify-utils'
import { getLogger } from '@tactica/logging'
import { config } from './config.js'
import { db } from './db/client.js'
import { AnalysisRepository } from './domain/AnalysisRepository.js'
import { StockfishClient } from './domain/StockfishClient.js'
import { buildRunAnalysisJob } from './jobs/runAnalysisJob.js'
import { JobQueue } from './jobs/jobQueue.js'
import { registerAnalysisRoutes, registerHealthRoutes } from './registerAnalysisRoutes.js'

const start = async (): Promise<void> => {
  const analysisRepository = new AnalysisRepository(db)
  const engine = new StockfishClient(config.stockfishUrl)
  const jobQueue = new JobQueue(config.databaseUrl, {
    runAnalysis: buildRunAnalysisJob({
      analysisRepository,
      engine,
      defaults: config.analysis,
    }),
  })
  const requireInternalApiKey = buildRequireInternalApiKey(config.internalApiKey)

  const app = await FastifyAppBuilder.build({
    kind: 'internal',
    registerRoutes: async (instance) => {
      // Gate the service's own paths, leaving /health reachable for container healthchecks and the
      // CI readiness wait.
      instance.addHook('preHandler', async (request, reply) => {
        if (request.url.startsWith('/tactica-analysis/')) {
          await requireInternalApiKey(request, reply)
        }
      })
      await registerHealthRoutes(instance)
      await registerAnalysisRoutes(instance, { analysisRepository, jobQueue })
    },
  })

  await jobQueue.start({ worker: config.workerEnabled })
  await app.listen({ port: config.port, host: config.host })
  getLogger().info(`tactica-analysis listening on http://${config.host}:${config.port}`, {
    stockfishUrl: config.stockfishUrl,
    workerEnabled: config.workerEnabled,
  })
}

start().catch((error: unknown) => {
  getLogger().error('Failed to start tactica-analysis', { err: (error as Error).message })
  process.exit(1)
})
