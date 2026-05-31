import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { db, sql } from './client.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const migrationsFolder = path.resolve(__dirname, '../../drizzle')

try {
  console.warn(`Running migrations from ${migrationsFolder}`)
  await migrate(db, { migrationsFolder })
  console.warn('Migrations complete')
} finally {
  await sql.end()
}
