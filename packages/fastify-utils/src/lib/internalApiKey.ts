import { createHash, timingSafeEqual } from 'node:crypto'
import { UnauthorizedError } from '@tactica/errors'
import type { FastifyReply, FastifyRequest } from 'fastify'

export const INTERNAL_API_KEY_HEADER = 'x-internal-api-key'

/** Hash both sides so the comparison is constant-time without leaking the key's length. */
const digest = (value: string): Buffer => createHash('sha256').update(value).digest()

/**
 * Gate for internal, service-to-service backends. They hold no user session, so this is the whole of
 * their auth: a shared key that only our own services know.
 *
 * It is a blunt instrument on purpose — it says "this call came from inside the stack", nothing about
 * *which* user, because internal services never make per-user decisions (tactica-core owns user data
 * and does that check before it ever calls out).
 *
 * Register it as a `preHandler` hook **inside an encapsulated plugin** that holds the gated routes, so
 * it applies to exactly the routes the router matched. Never gate by string-matching `request.url`:
 * that's the raw, still percent-encoded URL, while Fastify routes on the decoded path — so
 * `/%74actica-analysis/...` would match the route but slip past a `startsWith('/tactica-analysis/')`
 * check. Unauthenticated probes like `GET /health` stay outside the plugin.
 */
export const buildRequireInternalApiKey = (expectedKey: string) => {
  const expectedDigest = digest(expectedKey)
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const provided = request.headers[INTERNAL_API_KEY_HEADER]
    if (typeof provided !== 'string' || !timingSafeEqual(digest(provided), expectedDigest)) {
      throw new UnauthorizedError(`Missing or invalid ${INTERNAL_API_KEY_HEADER} header`)
    }
  }
}
