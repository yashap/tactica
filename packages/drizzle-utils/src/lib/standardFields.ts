import { sql } from 'drizzle-orm'
import { timestamp, uuid } from 'drizzle-orm/pg-core'

export const standardFields = {
  id: uuid('id').primaryKey().defaultRandom(),
  createdAt: timestamp('createdAt', { precision: 3, withTimezone: true })
    .notNull()
    .default(sql`now()`),
  updatedAt: timestamp('updatedAt', { precision: 3, withTimezone: true })
    .notNull()
    .default(sql`now()`),
}
