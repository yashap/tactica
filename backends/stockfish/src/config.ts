import { required } from '@tactica/errors'

const env = (key: string, fallback?: string): string => {
  const value = process.env[key] ?? fallback
  return required(value, `Missing required env var: ${key}`)
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

export const config = {
  port: intEnv('PORT', 3503),
  host: env('HOST_NAME', '0.0.0.0'),
  /** Resolved from PATH inside the container; overridable for local runs against a host binary. */
  stockfishPath: env('STOCKFISH_PATH', 'stockfish'),
  /**
   * Hard ceiling on shutdown. Whatever goes wrong while closing down, the process exits by then —
   * a container that refuses to die is worse than an unclean exit, since it wedges `serve:backend`
   * and leaves the port bound.
   */
  shutdownDeadlineMs: intEnv('SHUTDOWN_DEADLINE_MS', 5_000),
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
} as const
