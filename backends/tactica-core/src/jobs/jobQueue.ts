import { getLogger } from '@tactica/logging'
import { PgBoss } from 'pg-boss'

export interface ImportGamesPayload {
  gameAccountId: string
  userId: string
}

export interface AnalyzeGamePayload {
  gameId: string
  userId: string
}

export interface JobHandlers {
  importGames: (payload: ImportGamesPayload) => Promise<void>
  analyzeGame: (payload: AnalyzeGamePayload) => Promise<void>
}

const IMPORT_GAMES_QUEUE = 'import-games'
const ANALYZE_GAME_QUEUE = 'analyze-game'

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
  ) {
    this.boss = new PgBoss(databaseUrl)
  }

  public async start(options: { worker: boolean }): Promise<void> {
    this.boss.on('error', (error) => {
      getLogger().error('pg-boss error', { err: (error as Error).message })
    })
    await this.boss.start()
    // createQueue is an upsert — safe to run on every boot
    await this.boss.createQueue(IMPORT_GAMES_QUEUE, {
      policy: 'stately', // at most one queued + one active job per singletonKey
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
    })
    // Analysis is slow (seconds of engine time per game) and the engine is a single-slot resource,
    // so this queue exists mainly to spread that work out rather than to run it in parallel.
    await this.boss.createQueue(ANALYZE_GAME_QUEUE, {
      policy: 'stately',
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
    })
    if (options.worker) {
      await this.boss.work<ImportGamesPayload>(IMPORT_GAMES_QUEUE, async (jobs) => {
        for (const job of jobs) {
          await this.handlers.importGames(job.data)
        }
      })
      await this.boss.work<AnalyzeGamePayload>(ANALYZE_GAME_QUEUE, async (jobs) => {
        for (const job of jobs) {
          await this.handlers.analyzeGame(job.data)
        }
      })
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

  public async stop(): Promise<void> {
    await this.boss.stop()
  }
}
