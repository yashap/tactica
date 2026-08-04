import { InputValidationError } from '@tactica/errors'
import { RequestValidationError } from '@ts-rest/fastify'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { describe, expect, it } from 'vitest'
import { z, type ZodError } from 'zod'
import { tacticaRequestValidationErrorHandler } from './requestValidationErrorHandler.js'

/** Produce a real ZodError the way ts-rest would, by failing a parse. */
const zodErrorFor = (schema: z.ZodTypeAny, value: unknown): ZodError => {
  const result = schema.safeParse(value)
  if (result.success) throw new Error('Expected the parse to fail')
  return result.error
}

interface CapturedReply {
  statusCode?: number
  body?: unknown
}

/** Minimal stand-in for the bits of FastifyReply this handler touches. */
const buildReply = (): { reply: FastifyReply; captured: CapturedReply } => {
  const captured: CapturedReply = {}
  const reply = {
    status(code: number) {
      captured.statusCode = code
      return this
    },
    send(body: unknown) {
      captured.body = body
      return this
    },
  }
  return { reply: reply as unknown as FastifyReply, captured }
}

const request = {} as FastifyRequest

describe('tacticaRequestValidationErrorHandler', () => {
  it('answers with a standard InputValidationError DTO instead of raw Zod output', () => {
    const bodyError = zodErrorFor(z.object({ fen: z.string() }), { fen: 42 })
    const { reply, captured } = buildReply()

    tacticaRequestValidationErrorHandler(new RequestValidationError(null, null, null, bodyError), request, reply)

    expect(captured.statusCode).toBe(400)
    // The shape every other response in the stack uses, so clients can branch on `code`
    expect(captured.body).toMatchObject({ code: InputValidationError.name })
    const body = captured.body as { message: string; metadata: { issues: unknown[] } }
    expect(body.message).toContain('body.fen')
    expect(body.metadata.issues).toHaveLength(1)
  })

  it('names the source of each failure and includes every issue', () => {
    const pathError = zodErrorFor(z.object({ id: z.string().uuid() }), { id: 'nope' })
    const queryError = zodErrorFor(z.object({ limit: z.number() }), { limit: 'ten' })
    const { reply, captured } = buildReply()

    tacticaRequestValidationErrorHandler(new RequestValidationError(pathError, null, queryError, null), request, reply)

    const body = captured.body as { message: string; metadata: { issues: { source: string; path: string }[] } }
    expect(body.message).toContain('path.id')
    expect(body.message).toContain('query.limit')
    expect(body.metadata.issues.map((issue) => issue.source)).toEqual(['path', 'query'])
  })

  it('still produces a usable DTO when no issues are attached', () => {
    const { reply, captured } = buildReply()

    tacticaRequestValidationErrorHandler(new RequestValidationError(null, null, null, null), request, reply)

    expect(captured.statusCode).toBe(400)
    expect((captured.body as { message: string }).message).toContain('unknown field')
  })
})
