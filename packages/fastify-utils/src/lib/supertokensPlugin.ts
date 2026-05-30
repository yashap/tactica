import type { FastifyInstance } from 'fastify'
import fp from 'fastify-plugin'
import supertokens from 'supertokens-node'
import { plugin as supertokensFastifyPlugin } from 'supertokens-node/framework/fastify/index.js'
import { errorHandler as supertokensErrorHandler } from 'supertokens-node/framework/fastify/index.js'

export interface SuperTokensFastifyPluginOptions {
  websiteDomain: string
}

const supertokensFastify = fp<SuperTokensFastifyPluginOptions>(
  async (fastify: FastifyInstance, opts: SuperTokensFastifyPluginOptions) => {
    await fastify.register(supertokensFastifyPlugin)
    fastify.setErrorHandler(supertokensErrorHandler())
    fastify.addHook('preHandler', async (request, reply) => {
      // CORS preflight handled by @fastify/cors above
      // exposed headers / credentials etc. are configured at the app builder level
      // Marking these args used to satisfy lint without doing work here
      void request
      void reply
    })
    void opts
  },
  {
    name: 'tactica-supertokens-plugin',
  },
)

export { supertokensFastify, supertokens }
