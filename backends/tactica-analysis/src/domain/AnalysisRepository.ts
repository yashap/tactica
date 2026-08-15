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

  public async create(row: NewAnalysisRow): Promise<AnalysisRow> {
    const [created] = await this.db.insert(analysisTable).values(row).returning()
    if (!created) {
      throw new Error('Failed to insert analysis')
    }
    return created
  }

  public async findById(id: string): Promise<AnalysisRow | undefined> {
    const rows = await this.db.select().from(analysisTable).where(eq(analysisTable.id, id)).limit(1)
    return rows[0]
  }

  public async markRunning(id: string): Promise<void> {
    await this.update(id, { status: 'running' })
  }

  public async markSucceeded(id: string, result: AnalysisResult): Promise<void> {
    // Clear any error from a previous failed attempt — pg-boss retries land back here
    await this.update(id, { status: 'succeeded', result, error: null })
  }

  public async markFailed(id: string, error: string): Promise<void> {
    await this.update(id, { status: 'failed', error })
  }

  private async update(id: string, patch: Partial<NewAnalysisRow>): Promise<void> {
    await this.db
      .update(analysisTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(analysisTable.id, id))
  }
}
