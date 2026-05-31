import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import postgres, { type Sql } from 'postgres'

export interface DbClientOptions {
  databaseUrl: string
  max?: number
}

/**
 * Build a postgres.js connection pool. Call `.end()` on the returned client for a graceful shutdown.
 * postgres.js is ESM-native (unlike `pg`), which keeps Vitest/Vite's CJS→ESM transform happy in
 * tests.
 */
export const buildPool = ({ databaseUrl, max }: DbClientOptions): Sql => postgres(databaseUrl, { max: max ?? 10 })

export const buildDb = <TSchema extends Record<string, unknown>>(
  client: Sql,
  schema: TSchema,
): PostgresJsDatabase<TSchema> => drizzle(client, { schema })
