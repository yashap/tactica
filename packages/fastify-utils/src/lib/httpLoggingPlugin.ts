import { getLogger, type Logger } from '@tactica/logging'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fp from 'fastify-plugin'

interface HttpLoggingPluginOptions {
  logger?: Logger
}

interface RequestState {
  start: bigint
}

declare module 'fastify' {
  interface FastifyRequest {
    httpLogState?: RequestState
  }
}

const formatDurationMs = (start: bigint): number => Number(process.hrtime.bigint() - start) / 1e6

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

    fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
      const start = request.httpLogState?.start
      const durationMs = start ? formatDurationMs(start) : undefined
      logger.info('Request completed', {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        remoteAddress: request.ip,
        userAgent: request.headers['user-agent'],
        ...(durationMs !== undefined ? { durationMs: Math.round(durationMs * 100) / 100 } : {}),
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
