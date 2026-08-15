import { defineConfig } from 'drizzle-kit'

// Service-prefixed, not DATABASE_URL: turbo hands every task the same environment, so a shared name
// would point this service at tactica-core's database.
const databaseUrl =
  process.env['ANALYSIS_DATABASE_URL'] ??
  'postgres://tactica_analysis:tactica_analysis_password@localhost:5440/tactica_analysis?sslmode=disable'

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: { url: databaseUrl },
})
