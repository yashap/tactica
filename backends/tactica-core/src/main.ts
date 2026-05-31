import { FastifyAppBuilder, requireSession } from '@tactica/fastify-utils'
import { getLogger } from '@tactica/logging'
import { initSuperTokens } from './auth/initSuperTokens.js'
import { config } from './config.js'
import { registerSessionRoutes } from './domain/session/registerSessionRoutes.js'
import { registerTodoRoutes } from './domain/todo/registerTodoRoutes.js'

const start = async (): Promise<void> => {
  initSuperTokens()
  const app = await FastifyAppBuilder.build({
    websiteDomain: config.websiteDomain,
    registerRoutes: async (instance) => {
      // Gate every /tactica-core/* path behind SuperTokens session verification. The /auth/*
      // paths handled by the SuperTokens plugin are unaffected — they need to be reachable
      // without a session so users can sign up / sign in.
      instance.addHook('preHandler', async (req, reply) => {
        if (req.url.startsWith('/tactica-core/')) {
          await requireSession(req, reply)
        }
      })
      await registerSessionRoutes(instance)
      await registerTodoRoutes(instance)
    },
  })
  await app.listen({ port: config.port, host: config.host })
  getLogger().info(`tactica-core listening on http://${config.host}:${config.port}`)
}

start().catch((error: unknown) => {
  getLogger().error('Failed to start tactica-core', { err: (error as Error).message })
  process.exit(1)
})
