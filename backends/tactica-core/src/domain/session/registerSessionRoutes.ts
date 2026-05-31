import { getSessionUserId } from '@tactica/fastify-utils'
import { tacticaCoreContract } from '@tactica/tactica-core-contract'
import { initServer } from '@ts-rest/fastify'
import type { FastifyInstance } from 'fastify'

export const registerSessionRoutes = async (app: FastifyInstance): Promise<void> => {
  const s = initServer()
  const router = s.router(tacticaCoreContract.session, {
    get: async ({ request }) => {
      const userId = getSessionUserId(request)
      return { status: 200, body: { userId } }
    },
  })
  await app.register(s.plugin(router))
}
