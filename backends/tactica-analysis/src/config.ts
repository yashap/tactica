import { required } from '@tactica/errors'

const env = (key: string, fallback?: string): string => {
  const value = process.env[key] ?? fallback
  return required(value, `Missing required env var: ${key}`)
}

/** A positive integer env var, at most `max` when given — so a typo fails at boot, not on every job. */
const intEnv = (key: string, fallback: number, max?: number): number => {
  const raw = process.env[key]
  if (raw === undefined || raw === '') return fallback
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0 || (max !== undefined && parsed > max)) {
    throw new Error(`Invalid ${key}: expected a positive integer${max === undefined ? '' : ` ≤ ${max}`}, got '${raw}'`)
  }
  return parsed
}

export const config = {
  port: intEnv('ANALYSIS_PORT', 3502),
  host: env('HOST_NAME', '0.0.0.0'),
  databaseUrl: env(
    'ANALYSIS_DATABASE_URL',
    'postgres://tactica_analysis:tactica_analysis_password@localhost:5440/tactica_analysis?sslmode=disable',
  ),
  stockfishUrl: env('STOCKFISH_URL', 'http://localhost:3503'),
  /**
   * Shared secret proving a request came from inside the stack. A committed dev default, not a
   * secret in any real sense — deployments must override it.
   */
  internalApiKey: env('INTERNAL_API_KEY', 'dev_internal_key'),
  /** When false, this process serves HTTP but runs no analysis jobs (e.g. in tests). */
  workerEnabled: env('WORKER_ENABLED', 'true') === 'true',
  // Capped at what the stockfish contract accepts, so an out-of-range value fails at startup instead
  // of turning every job into a 400 from the engine.
  analysis: {
    /** Cheap first pass over every position — just enough to spot where things went wrong. */
    scanMovetimeMs: intEnv('ANALYSIS_SCAN_MOVETIME_MS', 80, 10_000),
    /** Slower multi-PV search of the handful of positions that turned out to matter. */
    deepMovetimeMs: intEnv('ANALYSIS_DEEP_MOVETIME_MS', 1_000, 60_000),
    multiPv: intEnv('ANALYSIS_MULTI_PV', 3, 10),
  },
} as const
