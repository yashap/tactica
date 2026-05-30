import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import pg from 'pg'

const { Pool } = pg

export interface DbClientOptions {
  databaseUrl: string
  max?: number
}

export const buildPool = ({ databaseUrl, max }: DbClientOptions): pg.Pool =>
  new Pool({ connectionString: databaseUrl, max: max ?? 10 })

export const buildDb = <TSchema extends Record<string, unknown>>(
  pool: pg.Pool,
  schema: TSchema,
): NodePgDatabase<TSchema> => drizzle(pool, { schema })
