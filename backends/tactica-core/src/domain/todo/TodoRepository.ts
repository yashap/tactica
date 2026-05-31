import { NotFoundError } from '@tactica/errors'
import { and, desc, eq } from 'drizzle-orm'
import { type Db } from '../../db/client.js'
import { todoTable, type TodoRow } from '../../db/schema.js'

export class TodoRepository {
  public constructor(private readonly db: Db) {}

  public async list(userId: string): Promise<TodoRow[]> {
    return this.db.select().from(todoTable).where(eq(todoTable.userId, userId)).orderBy(desc(todoTable.createdAt))
  }

  public async findById(userId: string, id: string): Promise<TodoRow | undefined> {
    const rows = await this.db
      .select()
      .from(todoTable)
      .where(and(eq(todoTable.userId, userId), eq(todoTable.id, id)))
      .limit(1)
    return rows[0]
  }

  public async create(userId: string, title: string): Promise<TodoRow> {
    const [row] = await this.db.insert(todoTable).values({ userId, title }).returning()
    if (!row) {
      throw new Error('Failed to insert todo')
    }
    return row
  }

  public async update(userId: string, id: string, patch: { title?: string; done?: boolean }): Promise<TodoRow> {
    const [row] = await this.db
      .update(todoTable)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(todoTable.userId, userId), eq(todoTable.id, id)))
      .returning()
    if (!row) {
      throw new NotFoundError(`Todo ${id} not found`)
    }
    return row
  }

  public async delete(userId: string, id: string): Promise<void> {
    const result = await this.db
      .delete(todoTable)
      .where(and(eq(todoTable.userId, userId), eq(todoTable.id, id)))
      .returning({ id: todoTable.id })
    if (result.length === 0) {
      throw new NotFoundError(`Todo ${id} not found`)
    }
  }
}
