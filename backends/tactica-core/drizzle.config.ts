import { defineConfig } from 'drizzle-kit'

const databaseUrl =
  process.env['DATABASE_URL'] ??
  'postgres://tactica_core:tactica_core_password@localhost:5440/tactica_core?sslmode=disable'

export default defineConfig({
  out: './drizzle',
  schema: './src/db/schema.ts',
  dialect: 'postgresql',
  dbCredentials: { url: databaseUrl },
})
