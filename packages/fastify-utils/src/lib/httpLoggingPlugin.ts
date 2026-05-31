import { getLogger, type Logger } from '@tactica/logging'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'

interface HttpLoggingPluginOptions {
  logger?: Logger
}

interface RequestState {
  start: bigint
  responseBody?: unknown
}

declare module 'fastify' {
  interface FastifyRequest {
    httpLogState?: RequestState
  }
}

const MAX_BODY_LOG_LENGTH = 2000

/**
 * Best-effort parse of an outgoing payload for logging. Fastify hands `onSend` the serialized
 * payload (usually a string/Buffer), so we try to JSON-parse it back into an object and truncate
 * anything huge. Returns `undefined` when there's nothing useful to log.
 */
const parseResponseBody = (payload: unknown): unknown => {
  if (payload === undefined || payload === null) return undefined
  if (typeof payload === 'string') {
    if (payload.length === 0) return undefined
    try {
      return JSON.parse(payload)
    } catch {
      return payload.length > MAX_BODY_LOG_LENGTH ? `${payload.slice(0, MAX_BODY_LOG_LENGTH)}…` : payload
    }
  }
  if (Buffer.isBuffer(payload)) {
    const text = payload.toString('utf8')
    return text.length > MAX_BODY_LOG_LENGTH ? `${text.slice(0, MAX_BODY_LOG_LENGTH)}…` : text
  }
  return undefined
}

const formatDurationMs = (start: bigint): number => Number(process.hrtime.bigint() - start) / 1e6

type LogMethod = 'debug' | 'info' | 'warn' | 'error'

const pickLogMethod = (method: string, statusCode: number): LogMethod => {
  if (method === 'OPTIONS') return 'debug'
  if (statusCode >= 500) return 'error'
  if (statusCode >= 400) return 'warn'
  return 'info'
}

/**
 * Logs each request once on completion (`Request completed`) with method, url, status code,
 * remote address, user agent, and wall-clock duration. An `onRequest` hook stashes the start
 * timestamp on the request so we can measure duration without emitting a separate log line.
 */
export const httpLoggingPlugin = fp<HttpLoggingPluginOptions>(
  async (fastify: FastifyInstance, opts: HttpLoggingPluginOptions) => {
    const logger = opts.logger ?? getLogger().child('http')

    fastify.addHook('onRequest', async (request: FastifyRequest) => {
      request.httpLogState = { start: process.hrtime.bigint() }
    })

    // Capture the outgoing payload so we can include it in the completion log for error responses.
    // `onSend` is the only hook that sees the (already-serialized) body before it goes out the door.
    fastify.addHook('onSend', async (request: FastifyRequest, reply: FastifyReply, payload: unknown) => {
      if (request.httpLogState && reply.statusCode >= 400) {
        request.httpLogState.responseBody = parseResponseBody(payload)
      }
      return payload
    })

    fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
      const start = request.httpLogState?.start
      const durationMs = start ? formatDurationMs(start) : undefined
      const responseBody = request.httpLogState?.responseBody
      const logMethod = pickLogMethod(request.method, reply.statusCode)
      logger[logMethod]('Request completed', {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        remoteAddress: request.ip,
        userAgent: request.headers['user-agent'],
        ...(durationMs !== undefined ? { durationMs: Math.round(durationMs * 100) / 100 } : {}),
        // Only present for >= 400 responses (see onSend); surfaces what the handler/SuperTokens returned.
        ...(responseBody !== undefined ? { responseBody } : {}),
      })
    })

    fastify.addHook('onError', async (request: FastifyRequest, _reply: FastifyReply, error: Error) => {
      logger.error('Request errored', {
        method: request.method,
        url: request.url,
        error,
      })
    })
  },
  { name: 'tactica-http-logging-plugin' },
)
