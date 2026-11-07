import { getLogger } from '@tactica/logging'
import { PgBoss } from 'pg-boss'

export interface RunAnalysisPayload {
  analysisId: string
}

export interface JobHandlers {
  runAnalysis: (payload: RunAnalysisPayload) => Promise<void>
}

const RUN_ANALYSIS_QUEUE = 'run-analysis'

/**
 * Thin typed facade over pg-boss, mirroring tactica-core's. HTTP handlers only ever *enqueue* — a
 * full game is seconds of engine time, so the work happens on the worker and callers poll.
 *
 * pg-boss owns its own `pgboss` schema in this service's database, entirely separate from the
 * Drizzle-managed tables.
 */
export class JobQueue {
  private readonly boss: PgBoss

  public constructor(
    databaseUrl: string,
    private readonly handlers: JobHandlers,
  ) {
    this.boss = new PgBoss(databaseUrl)
  }

  public async start(options: { worker: boolean }): Promise<void> {
    this.boss.on('error', (error) => {
      getLogger().error('pg-boss error', { err: (error as Error).message })
    })
    await this.boss.start()
    await this.boss.createQueue(RUN_ANALYSIS_QUEUE, {
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
    })
    if (options.worker) {
      await this.boss.work<RunAnalysisPayload>(RUN_ANALYSIS_QUEUE, async (jobs) => {
        for (const job of jobs) {
          await this.handlers.runAnalysis(job.data)
        }
      })
    }
  }

  public async enqueueRunAnalysis(payload: RunAnalysisPayload): Promise<string | null> {
    // Keyed by analysis id so a duplicate submission can't double-book the engine
    return this.boss.send(RUN_ANALYSIS_QUEUE, payload, { singletonKey: payload.analysisId })
  }

  public async stop(): Promise<void> {
    await this.boss.stop()
  }
}
