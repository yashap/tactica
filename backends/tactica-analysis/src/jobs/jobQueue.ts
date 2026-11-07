import { randomUUID } from 'node:crypto'
import { CorrelationIdPropagator } from '@tactica/correlation-id-propagator'
import { getLogger } from '@tactica/logging'
import { type JobWithMetadata, PgBoss } from 'pg-boss'

export interface RunAnalysisPayload {
  analysisId: string
  /** The submitting request's correlation id, so the job's logs (and its engine calls) join its trace. */
  correlationId?: string
}

/** What a handler needs to know about the attempt it's running as. */
export interface JobAttempt {
  /** No retry follows if this attempt throws — the handler should record a final failure. */
  isFinalAttempt: boolean
  /** Aborted when pg-boss gives up on the job (expiry) or the worker shuts down. */
  signal: AbortSignal
}

export interface JobHandlers {
  runAnalysis: (payload: RunAnalysisPayload, attempt: JobAttempt) => Promise<void>
}

const RUN_ANALYSIS_QUEUE = 'run-analysis'

const RUN_ANALYSIS_QUEUE_OPTIONS = {
  retryLimit: 3,
  retryDelay: 30,
  retryBackoff: true,
  // Longer than any realistic game at the maximum per-request settings, so pg-boss only expires a
  // job that's genuinely wedged. Expiry aborts `attempt.signal`, which cancels in-flight engine calls.
  expireInSeconds: 15 * 60,
}

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
    // createQueue never changes an existing queue's options, so apply them explicitly as well —
    // otherwise a tweak here would silently never reach a database that already has the queue.
    await this.boss.createQueue(RUN_ANALYSIS_QUEUE, RUN_ANALYSIS_QUEUE_OPTIONS)
    await this.boss.updateQueue(RUN_ANALYSIS_QUEUE, RUN_ANALYSIS_QUEUE_OPTIONS)
    if (options.worker) {
      // No explicit type argument: it would stop TS inferring `includeMetadata: true` from the
      // options literal, which is what gives the handler retryCount/retryLimit.
      await this.boss.work(
        RUN_ANALYSIS_QUEUE,
        { includeMetadata: true },
        async (jobs: JobWithMetadata<RunAnalysisPayload>[]) => {
          for (const job of jobs) {
            const attempt = { isFinalAttempt: job.retryCount >= job.retryLimit, signal: job.signal }
            await CorrelationIdPropagator.runWithContext(job.data.correlationId ?? randomUUID(), () =>
              this.handlers.runAnalysis(job.data, attempt),
            )
          }
        },
      )
    }
  }

  /**
   * Queue a run. Duplicate submissions are prevented upstream — the route only enqueues for a newly
   * created (or re-queued) analysis, keyed by the caller's idempotency key — so no singleton here.
   */
  public async enqueueRunAnalysis(payload: RunAnalysisPayload): Promise<string | null> {
    return this.boss.send(RUN_ANALYSIS_QUEUE, payload)
  }

  /** Stop taking work and wait (bounded) for in-flight jobs, so a deploy doesn't strand them. */
  public async stop(): Promise<void> {
    await this.boss.stop({ graceful: true, timeout: 30_000 })
  }
}
