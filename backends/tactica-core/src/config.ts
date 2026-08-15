import { required } from '@tactica/errors'

const env = (key: string, fallback?: string): string => {
  const value = process.env[key] ?? fallback
  return required(value, `Missing required env var: ${key}`)
}

export const config = {
  port: Number(env('PORT', '3501')),
  host: env('HOST_NAME', '0.0.0.0'),
  websiteDomain: env('TACTICA_WEB_URL', 'http://localhost:8081'),
  apiDomain: env('TACTICA_CORE_URL', 'http://localhost:3501'),
  databaseUrl: env(
    'DATABASE_URL',
    'postgres://tactica_core:tactica_core_password@localhost:5440/tactica_core?sslmode=disable',
  ),
  supertokens: {
    connectionUri: env('SUPERTOKENS_CORE_URL', 'http://localhost:3567'),
    apiKey: process.env['SUPERTOKENS_API_KEY'],
  },
  /** When false, this process serves HTTP but does not run background jobs (e.g. in tests). */
  workerEnabled: env('WORKER_ENABLED', 'true') === 'true',
  /** Cap on how many monthly archives a single import job will fetch (first sync = recent N months). */
  importMaxMonths: Number(env('IMPORT_MAX_MONTHS', '3')),
  analysis: {
    url: env('ANALYSIS_URL', 'http://localhost:3502'),
    /** Shared secret proving the call came from inside the stack; deployments must override. */
    internalApiKey: env('INTERNAL_API_KEY', 'dev_internal_key'),
    pollIntervalMs: Number(env('ANALYSIS_POLL_INTERVAL_MS', '2000')),
    /** Generous: a long game at default movetimes is tens of seconds of engine time. */
    pollTimeoutMs: Number(env('ANALYSIS_POLL_TIMEOUT_MS', '300000')),
  },
  chesscom: {
    apiUrl: env('CHESSCOM_API_URL', 'https://api.chess.com/pub'),
    // chess.com asks API consumers to identify themselves via User-Agent so they can reach out
    // (or throttle) rather than block anonymous traffic outright
    userAgent: env('CHESSCOM_USER_AGENT', 'Tactica (https://github.com/yashap/tactica)'),
  },
} as const
