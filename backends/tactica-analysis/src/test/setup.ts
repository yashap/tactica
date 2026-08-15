/**
 * Vitest environment setup. Points the service at the test Postgres container rather than the dev
 * one, and keeps background workers off — tests invoke job handlers directly so nothing races them.
 * Assumes `pnpm db:migrate-up:test` has been run from the repo root.
 */
process.env['ANALYSIS_DATABASE_URL'] =
  process.env['ANALYSIS_DATABASE_URL'] ??
  'postgres://tactica_analysis:tactica_analysis_password@localhost:5441/tactica_analysis?sslmode=disable'
process.env['LOG_LEVEL'] = process.env['LOG_LEVEL'] ?? 'off'
process.env['WORKER_ENABLED'] = 'false'
