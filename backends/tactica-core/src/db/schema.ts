import { standardFields } from '@tactica/drizzle-utils'
import { boolean, index, pgTable, text, uuid } from 'drizzle-orm/pg-core'

export const todoTable = pgTable(
  'Todo',
  {
    ...standardFields,
    userId: uuid('userId').notNull(),
    title: text('title').notNull(),
    done: boolean('done').notNull().default(false),
  },
  (table) => [index('Todo_userId_idx').on(table.userId)],
)

export type TodoRow = typeof todoTable.$inferSelect
export type NewTodoRow = typeof todoTable.$inferInsert
