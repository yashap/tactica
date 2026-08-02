import { NotFoundError } from '@tactica/errors'
import { and, asc, eq } from 'drizzle-orm'
import { type Db } from '../../db/client.js'
import { gameAccountTable, type GameAccountRow, type NewGameAccountRow } from '../../db/schema.js'

export class GameAccountRepository {
  public constructor(private readonly db: Db) {}

  public async list(userId: string): Promise<GameAccountRow[]> {
    return this.db
      .select()
      .from(gameAccountTable)
      .where(eq(gameAccountTable.userId, userId))
      .orderBy(asc(gameAccountTable.createdAt))
  }

  public async findById(userId: string, id: string): Promise<GameAccountRow | undefined> {
    const rows = await this.db
      .select()
      .from(gameAccountTable)
      .where(and(eq(gameAccountTable.userId, userId), eq(gameAccountTable.id, id)))
      .limit(1)
    return rows[0]
  }

  public async create(row: NewGameAccountRow): Promise<GameAccountRow> {
    const [created] = await this.db.insert(gameAccountTable).values(row).returning()
    if (!created) {
      throw new Error('Failed to insert game account')
    }
    return created
  }

  public async setLastSyncJobId(userId: string, id: string, jobId: string): Promise<void> {
    await this.update(userId, id, { lastSyncJobId: jobId })
  }

  /** Record a finished sync: bump lastSyncedAt, and advance the checkpoint if one was reached. */
  public async recordSyncCompleted(userId: string, id: string, syncCheckpoint?: string): Promise<void> {
    await this.update(userId, id, { lastSyncedAt: new Date(), ...(syncCheckpoint ? { syncCheckpoint } : {}) })
  }

  public async delete(userId: string, id: string): Promise<void> {
    const result = await this.db
      .delete(gameAccountTable)
      .where(and(eq(gameAccountTable.userId, userId), eq(gameAccountTable.id, id)))
      .returning({ id: gameAccountTable.id })
    if (result.length === 0) {
      throw new NotFoundError(`Game account ${id} not found`)
    }
  }

  private async update(userId: string, id: string, patch: Partial<NewGameAccountRow>): Promise<void> {
    const result = await this.db
      .update(gameAccountTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(gameAccountTable.userId, userId), eq(gameAccountTable.id, id)))
      .returning({ id: gameAccountTable.id })
    if (result.length === 0) {
      throw new NotFoundError(`Game account ${id} not found`)
    }
  }
}
