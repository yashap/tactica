import { CorrelationIdPropagator } from '@tactica/correlation-id-propagator'
import { getLogger } from '@tactica/logging'
import { type JobWithMetadata, PgBoss } from 'pg-boss'

export interface ImportGamesPayload {
  gameAccountId: string
  userId: string
}

export interface AnalyzeGamePayload {
  gameId: string
  userId: string
}

/** What a handler needs to know about the attempt it's running as. */
export interface JobAttempt {
  /** No retry follows if this attempt throws — the handler should record a final failure. */
  isFinalAttempt: boolean
  /** Aborted when pg-boss gives up on the job (expiry) or the worker shuts down. */
  signal: AbortSignal
}

export interface JobHandlers {
  importGames: (payload: ImportGamesPayload) => Promise<void>
  analyzeGame: (payload: AnalyzeGamePayload, attempt: JobAttempt) => Promise<void>
}

const IMPORT_GAMES_QUEUE = 'import-games'
const ANALYZE_GAME_QUEUE = 'analyze-game'

const IMPORT_GAMES_QUEUE_OPTIONS = {
  policy: 'stately' as const, // at most one queued + one active job per singletonKey
  retryLimit: 3,
  retryDelay: 30,
  retryBackoff: true,
}

/**
 * Analysis is slow (seconds of engine time per game) and the engine is a single-slot resource, so
 * this queue exists mainly to spread that work out rather than to run it in parallel.
 */
const ANALYZE_GAME_QUEUE_OPTIONS = {
  policy: 'stately' as const,
  retryLimit: 3,
  retryDelay: 30,
  retryBackoff: true,
}

/** Retry/expiry settings `updateQueue` may change; a queue's policy is fixed at creation. */
const updatable = ({ policy: _policy, ...rest }: { policy: string } & Record<string, unknown>) => rest

/**
 * Run each job inside its own correlation id, so every log line it emits — and every call it makes
 * to another service, which forwards the id — can be tied back to the one job.
 */
const withCorrelationId = <T>(job: { id: string }, run: () => Promise<T>): Promise<T> =>
  CorrelationIdPropagator.runWithContext(`job-${job.id}`, run)

/** pg-boss job states meaning "queued or running" (as opposed to reaching a terminal state). */
const ACTIVE_JOB_STATES: ReadonlySet<string> = new Set(['created', 'retry', 'active'])

/**
 * Thin typed facade over pg-boss. HTTP handlers only ever *enqueue* jobs; the actual work runs in
 * the background worker, which `main.ts` enables via `start({ worker: true })` (disabled in tests,
 * which invoke the handlers in {@link JobHandlers} directly instead).
 *
 * pg-boss manages its own schema (named `pgboss`) in the service's database, entirely separate
 * from the Drizzle-managed tables.
 */
export class JobQueue {
  private readonly boss: PgBoss

  public constructor(
    databaseUrl: string,
    private readonly handlers: JobHandlers,
    private readonly options: { analyzeGameTimeoutMs: number },
  ) {
    this.boss = new PgBoss(databaseUrl)
  }

  public async start(options: { worker: boolean }): Promise<void> {
    this.boss.on('error', (error) => {
      getLogger().error('pg-boss error', { err: (error as Error).message })
    })
    await this.boss.start()
    // createQueue never changes an existing queue's options, so apply the updatable ones explicitly
    // as well — otherwise a tweak here would silently never reach a database that has the queue.
    await this.boss.createQueue(IMPORT_GAMES_QUEUE, IMPORT_GAMES_QUEUE_OPTIONS)
    await this.boss.updateQueue(IMPORT_GAMES_QUEUE, updatable(IMPORT_GAMES_QUEUE_OPTIONS))
    const analyzeGameQueueOptions = {
      ...ANALYZE_GAME_QUEUE_OPTIONS,
      // The job holds its slot while it polls, so it must outlive the poll timeout; otherwise pg-boss
      // would expire it mid-poll and start a retry alongside it.
      expireInSeconds: Math.ceil(this.options.analyzeGameTimeoutMs / 1000) + 120,
    }
    await this.boss.createQueue(ANALYZE_GAME_QUEUE, analyzeGameQueueOptions)
    await this.boss.updateQueue(ANALYZE_GAME_QUEUE, updatable(analyzeGameQueueOptions))
    if (options.worker) {
      await this.boss.work<ImportGamesPayload>(IMPORT_GAMES_QUEUE, async (jobs) => {
        for (const job of jobs) {
          await withCorrelationId(job, () => this.handlers.importGames(job.data))
        }
      })
      // No explicit type argument: it would stop TS inferring `includeMetadata: true` from the
      // options literal, which is what gives the handler retryCount/retryLimit.
      await this.boss.work(
        ANALYZE_GAME_QUEUE,
        { includeMetadata: true },
        async (jobs: JobWithMetadata<AnalyzeGamePayload>[]) => {
          for (const job of jobs) {
            const attempt = { isFinalAttempt: job.retryCount >= job.retryLimit, signal: job.signal }
            await withCorrelationId(job, () => this.handlers.analyzeGame(job.data, attempt))
          }
        },
      )
    }
  }

  /**
   * Enqueue an import for a game account. Returns the job id, or `null` when an equivalent job is
   * already queued for this account (the `stately` policy + singletonKey deduplicates).
   */
  public async enqueueImportGames(payload: ImportGamesPayload): Promise<string | null> {
    return this.boss.send(IMPORT_GAMES_QUEUE, payload, { singletonKey: payload.gameAccountId })
  }

  /** Queue analysis for one game. Keyed by game id, so a game can't be queued twice at once. */
  public async enqueueAnalyzeGame(payload: AnalyzeGamePayload): Promise<string | null> {
    return this.boss.send(ANALYZE_GAME_QUEUE, payload, { singletonKey: payload.gameId })
  }

  /** Whether the given import job is still queued or running. */
  public async isImportJobActive(jobId: string): Promise<boolean> {
    const job = await this.boss.getJobById(IMPORT_GAMES_QUEUE, jobId)
    return job !== null && ACTIVE_JOB_STATES.has(job.state)
  }

  /** Stop taking work and wait (bounded) for in-flight jobs, so a deploy doesn't strand them. */
  public async stop(): Promise<void> {
    await this.boss.stop({ graceful: true, timeout: 30_000 })
  }
}
