/**
 * Vitest test environment setup. Run before any test imports `config`, so we can point the service
 * at the test Postgres container instead of the dev one. Tests assume `pnpm db:migrate-up:test` has
 * been run from the repo root first — see backends/tactica-core/README.md.
 */
process.env['DATABASE_URL'] =
  process.env['DATABASE_URL'] ??
  'postgres://tactica_core:tactica_core_password@localhost:5441/tactica_core?sslmode=disable'
process.env['LOG_LEVEL'] = process.env['LOG_LEVEL'] ?? 'off'
// Tests never run background workers — they invoke job handlers directly instead
process.env['WORKER_ENABLED'] = 'false'
