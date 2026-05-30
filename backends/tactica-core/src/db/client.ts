import { buildDb, buildPool } from '@tactica/drizzle-utils'
import { config } from '../config.js'
import * as schema from './schema.js'

export const pool = buildPool({ databaseUrl: config.databaseUrl })
export const db = buildDb(pool, schema)
export type Db = typeof db
