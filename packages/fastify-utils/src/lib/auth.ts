import { UnauthorizedError } from '@tactica/errors'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { verifySession } from 'supertokens-node/recipe/session/framework/fastify/index.js'
import type { SessionContainer } from 'supertokens-node/recipe/session/index.js'

declare module 'fastify' {
  interface FastifyRequest {
    session?: SessionContainer
  }
}

export const requireSession = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
  await verifySession()(request, reply)
}

export const getSessionUserId = (request: FastifyRequest): string => {
  const session = request.session
  if (!session) {
    throw new UnauthorizedError('No session present on request')
  }
  return session.getUserId()
}
