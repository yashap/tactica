const strEnv = (key: string, fallback: string): string => {
  const value = process.env[key]
  return value === undefined || value === '' ? fallback : value
}

const intEnv = (key: string, fallback: number): number => {
  const raw = process.env[key]
  if (raw === undefined || raw === '') return fallback
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${key}: expected a positive integer, got '${raw}'`)
  }
  return parsed
}

/**
 * All env reads happen here, once, per the repo convention. Deliberately hand-rolled rather than
 * using `@tactica/errors`: this service ships with zero runtime dependencies so its container is
 * just the Stockfish binary + Node + our compiled `dist`, with no npm install step.
 */
export const config = {
  port: intEnv('PORT', 3503),
  host: strEnv('HOST_NAME', '0.0.0.0'),
  /** Resolved from PATH inside the container; overridable for local runs against a host binary. */
  stockfishPath: strEnv('STOCKFISH_PATH', 'stockfish'),
  engine: {
    threads: intEnv('ENGINE_THREADS', 1),
    hashMb: intEnv('ENGINE_HASH', 128),
    /** Handshake (`uciok`/`readyok`) budget — a healthy engine answers in milliseconds. */
    handshakeTimeoutMs: intEnv('ENGINE_HANDSHAKE_TIMEOUT_MS', 10_000),
    /**
     * Slack beyond the requested movetime before we treat the engine as hung, kill it, and let the
     * next request respawn it. Stockfish overshoots `movetime` slightly by design.
     */
    searchGraceMs: intEnv('ENGINE_SEARCH_GRACE_MS', 10_000),
    /** Graceful `quit` budget on shutdown before SIGKILL. */
    shutdownTimeoutMs: intEnv('ENGINE_SHUTDOWN_TIMEOUT_MS', 2_000),
  },
  evaluateDefaults: {
    movetimeMs: intEnv('DEFAULT_MOVETIME_MS', 100),
    multiPv: intEnv('DEFAULT_MULTI_PV', 1),
  },
  evaluateLimits: {
    maxMovetimeMs: intEnv('MAX_MOVETIME_MS', 60_000),
    maxMultiPv: intEnv('MAX_MULTI_PV', 10),
    maxRequestBytes: intEnv('MAX_REQUEST_BYTES', 64 * 1024),
  },
} as const
