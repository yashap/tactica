import { getLogger, Logger } from '@tactica/logging'
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
 * Logs every request twice — once at start (`Request received`) and once at completion
 * (`Request completed`) with the response status code and the wall-clock duration in
 * milliseconds. Modeled after the structured payloads parker emits via `@parker/logging`.
 */
export const httpLoggingPlugin = fp<HttpLoggingPluginOptions>(
  // eslint-disable-next-line @typescript-eslint/require-await
  async (fastify: FastifyInstance, opts: HttpLoggingPluginOptions) => {
    const logger = opts.logger ?? getLogger().child('http')

    fastify.addHook('onRequest', async (request: FastifyRequest) => {
      request.httpLogState = { start: process.hrtime.bigint() }
      logger.info('Request received', {
        method: request.method,
        url: request.url,
        remoteAddress: request.ip,
        userAgent: request.headers['user-agent'],
      })
    })

    fastify.addHook('onResponse', async (request: FastifyRequest, reply: FastifyReply) => {
      const start = request.httpLogState?.start
      const durationMs = start ? formatDurationMs(start) : undefined
      logger.info('Request completed', {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
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
