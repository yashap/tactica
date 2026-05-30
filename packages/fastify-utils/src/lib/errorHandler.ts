import { InputValidationError, type ServerError, UnknownError } from '@tactica/errors'
import { getLogger } from '@tactica/logging'
import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify'

const isServerError = (error: unknown): error is ServerError =>
  !!error && typeof error === 'object' && (error as { isTacticaServerError?: boolean }).isTacticaServerError === true

export const tacticaErrorHandler = (
  error: FastifyError | Error,
  request: FastifyRequest,
  reply: FastifyReply,
): void => {
  if (isServerError(error)) {
    reply.status(error.httpStatusCode).send(error.toDto())
    return
  }
  // Fastify validation errors come through here with a `validation` array
  const fastifyError = error as FastifyError
  if (fastifyError.validation) {
    const wrapped = new InputValidationError(fastifyError.message, {
      metadata: { validation: fastifyError.validation },
    })
    reply.status(400).send(wrapped.toDto())
    return
  }
  getLogger().error('Unhandled error', {
    err: error.message,
    stack: error.stack,
    method: request.method,
    url: request.url,
  })
  const unknown = new UnknownError('Internal server error')
  reply.status(unknown.httpStatusCode).send(unknown.toDto())
}
