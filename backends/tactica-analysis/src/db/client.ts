import { buildDb, buildPool } from '@tactica/drizzle-utils'
import { config } from '../config.js'
import * as schema from './schema.js'

export const sql = buildPool({ databaseUrl: config.databaseUrl })
export const db = buildDb(sql, schema)
export type Db = typeof db
