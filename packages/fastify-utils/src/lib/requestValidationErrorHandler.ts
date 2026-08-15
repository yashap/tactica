import { InputValidationError } from '@tactica/errors'
import { type RequestValidationError } from '@ts-rest/fastify'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { ZodError, ZodIssue } from 'zod'

/**
 * By default `@ts-rest/fastify` answers a request-validation failure with its own shape —
 * `{ pathParameterErrors, headerErrors, queryParameterErrors, bodyErrors }` of raw `ZodError`s —
 * which is the one place our HTTP surface breaks the `{ message, code }` contract every other
 * response follows. Clients then can't recognize it: `buildServerErrorFromDto` needs a `code`, so it
 * degrades the response to an `UnknownError` whose message is a dump of Zod JSON.
 *
 * Pass this to `s.plugin(router, { requestValidationErrorHandler })` to get a normal
 * `InputValidationError` DTO instead, with the failing fields summarized in the message and the full
 * issue list kept in `metadata` for logs.
 */
export const tacticaRequestValidationErrorHandler = (
  error: RequestValidationError,
  _request: FastifyRequest,
  reply: FastifyReply,
): void => {
  const sources: { source: string; zodError: ZodError | null }[] = [
    { source: 'path', zodError: error.pathParams },
    { source: 'header', zodError: error.headers },
    { source: 'query', zodError: error.query },
    { source: 'body', zodError: error.body },
  ]

  const issues = sources.flatMap(({ source, zodError }) =>
    (zodError?.issues ?? []).map((issue: ZodIssue) => ({
      source,
      path: issue.path.join('.'),
      message: issue.message,
    })),
  )

  // e.g. "Invalid request: body.fen (Not a valid FEN)" — enough for a caller to fix the call
  const summary =
    issues.length > 0
      ? issues.map(({ source, path, message }) => `${source}${path ? `.${path}` : ''} (${message})`).join(', ')
      : 'unknown field'

  const validationError = new InputValidationError(`Invalid request: ${summary}`, { metadata: { issues } })
  void reply.status(validationError.httpStatusCode).send(validationError.toDto())
}
