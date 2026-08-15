import { UnauthorizedError } from '@tactica/errors'
import type { FastifyReply, FastifyRequest } from 'fastify'

export const INTERNAL_API_KEY_HEADER = 'x-internal-api-key'

/**
 * Gate for internal, service-to-service backends. They hold no user session, so this is the whole of
 * their auth: a shared key that only our own services know.
 *
 * It is a blunt instrument on purpose — it says "this call came from inside the stack", nothing about
 * *which* user, because internal services never make per-user decisions (tactica-core owns user data
 * and does that check before it ever calls out).
 *
 * Register it as a `preHandler` scoped to the service's own path prefix, so unauthenticated probes
 * like `GET /health` stay reachable for container healthchecks and CI readiness waits.
 */
export const buildRequireInternalApiKey =
  (expectedKey: string) =>
  async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const provided = request.headers[INTERNAL_API_KEY_HEADER]
    // Not a timing-safe compare: this key is a deployment-internal shared secret on a private
    // network, not a user credential, and the endpoints behind it are not oracles worth attacking
    // one byte at a time.
    if (typeof provided !== 'string' || provided !== expectedKey) {
      throw new UnauthorizedError(`Missing or invalid ${INTERNAL_API_KEY_HEADER} header`)
    }
  }
