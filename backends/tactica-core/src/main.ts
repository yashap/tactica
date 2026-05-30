import { FastifyAppBuilder } from '@tactica/fastify-utils'
import { getLogger } from '@tactica/logging'
import { initSuperTokens } from './auth/initSuperTokens.js'
import { config } from './config.js'
import { registerTodoRoutes } from './domain/todo/registerTodoRoutes.js'

const start = async (): Promise<void> => {
  initSuperTokens()
  const app = await FastifyAppBuilder.build({
    websiteDomain: config.websiteDomain,
    registerRoutes: async (instance) => {
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
