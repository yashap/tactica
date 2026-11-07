import { type AnalysisResult } from '@tactica/tactica-analysis-contract'
import { eq } from 'drizzle-orm'
import { type Db } from '../db/client.js'
import { analysisTable, type AnalysisRow, type NewAnalysisRow } from '../db/schema.js'

/**
 * No `userId` scoping here, unlike every repository in tactica-core: this service has no notion of
 * users. Ids are unguessable UUIDs and the whole API sits behind the internal-key gate.
 */
export class AnalysisRepository {
  public constructor(private readonly db: Db) {}

  /**
   * Insert a new analysis — or, when `idempotencyKey` matches an existing one, return that instead.
   * `created` says which, so the caller only queues work for a genuinely new row.
   */
  public async createOrGet(row: NewAnalysisRow): Promise<{ analysis: AnalysisRow; created: boolean }> {
    const [created] = await this.db
      .insert(analysisTable)
      .values(row)
      .onConflictDoNothing({ target: analysisTable.idempotencyKey })
      .returning()
    if (created) return { analysis: created, created: true }

    // Only an idempotency-key conflict skips the insert, so the key is set and the row exists
    const existing = row.idempotencyKey ? await this.findByIdempotencyKey(row.idempotencyKey) : undefined
    if (!existing) {
      throw new Error('Failed to insert analysis')
    }
    return { analysis: existing, created: false }
  }

  public async findById(id: string): Promise<AnalysisRow | undefined> {
    const rows = await this.db.select().from(analysisTable).where(eq(analysisTable.id, id)).limit(1)
    return rows[0]
  }

  public async findByIdempotencyKey(idempotencyKey: string): Promise<AnalysisRow | undefined> {
    const rows = await this.db
      .select()
      .from(analysisTable)
      .where(eq(analysisTable.idempotencyKey, idempotencyKey))
      .limit(1)
    return rows[0]
  }

  public async markRunning(id: string): Promise<void> {
    // A previous attempt's error no longer describes this one
    await this.update(id, { status: 'running', error: null })
  }

  public async markSucceeded(id: string, result: AnalysisResult): Promise<void> {
    // Clear any error from a previous failed attempt — retries land back here
    await this.update(id, { status: 'succeeded', result, error: null })
  }

  /** Final failure: no more retries are coming, so pollers can stop. */
  public async markFailed(id: string, error: string): Promise<void> {
    await this.update(id, { status: 'failed', error })
  }

  /**
   * An attempt failed but another is scheduled. Back to `queued`, not `failed` — `failed` is final,
   * and a poller that saw it mid-retry would give up on work that's about to succeed.
   */
  public async markRetryPending(id: string, error: string): Promise<void> {
    await this.update(id, { status: 'queued', error })
  }

  /** Give a finally-failed analysis a fresh start, e.g. when its caller resubmits it. */
  public async requeue(id: string): Promise<AnalysisRow | undefined> {
    const [row] = await this.db
      .update(analysisTable)
      .set({ status: 'queued', error: null, updatedAt: new Date() })
      .where(eq(analysisTable.id, id))
      .returning()
    return row
  }

  private async update(id: string, patch: Partial<NewAnalysisRow>): Promise<void> {
    await this.db
      .update(analysisTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(analysisTable.id, id))
  }
}
