import { CorrelationIdPropagator } from '@tactica/correlation-id-propagator'
import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import { randomUUID } from 'node:crypto'

const CORRELATION_ID_HEADER = 'x-correlation-id'

declare module 'fastify' {
  interface FastifyRequest {
    correlationId?: string
  }
}

/**
 * Reads the inbound `x-correlation-id` header (or generates a fresh UUID), attaches it to the
 * request, sets it on the response header for the caller, and enters it into the
 * CorrelationIdPropagator's AsyncLocalStorage so every log line emitted during the request
 * automatically carries the same correlation ID.
 */
export const correlationIdPlugin = fp(
  async (fastify: FastifyInstance) => {
    fastify.addHook('onRequest', async (request, reply) => {
      const inbound = request.headers[CORRELATION_ID_HEADER]
      const correlationId = typeof inbound === 'string' && inbound.length > 0 ? inbound : randomUUID()
      request.correlationId = correlationId
      void reply.header(CORRELATION_ID_HEADER, correlationId)
      CorrelationIdPropagator.enterWith(correlationId)
    })
  },
  { name: 'tactica-correlation-id-plugin' },
)
