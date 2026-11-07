import { getLogger } from '@tactica/logging'
import { buildApp } from './app.js'
import { config } from './config.js'
import { db } from './db/client.js'
import { AnalysisRepository } from './domain/AnalysisRepository.js'
import { StockfishClient } from './domain/StockfishClient.js'
import { buildRunAnalysisJob } from './jobs/runAnalysisJob.js'
import { JobQueue } from './jobs/jobQueue.js'

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

  const app = await buildApp({ analysisRepository, jobQueue, internalApiKey: config.internalApiKey })

  await jobQueue.start({ worker: config.workerEnabled })
  await app.listen({ port: config.port, host: config.host })
  getLogger().info(`tactica-analysis listening on http://${config.host}:${config.port}`, {
    stockfishUrl: config.stockfishUrl,
    workerEnabled: config.workerEnabled,
  })

  // Stop accepting requests, then let in-flight jobs finish (bounded) so a restart doesn't strand
  // an analysis mid-run until pg-boss's expiry notices.
  let stopping = false
  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return
    stopping = true
    getLogger().info('Shutting down tactica-analysis', { signal })
    await app.close()
    await jobQueue.stop()
    process.exit(0)
  }
  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => void shutdown(signal))
  }
}

start().catch((error: unknown) => {
  getLogger().error('Failed to start tactica-analysis', { err: (error as Error).message })
  process.exit(1)
})
