import cors from '@fastify/cors'
import formbody from '@fastify/formbody'
import { getLogger } from '@tactica/logging'
import Fastify, { type FastifyInstance } from 'fastify'
import supertokens from 'supertokens-node'
import { correlationIdPlugin } from './correlationIdPlugin.js'
import { tacticaErrorHandler } from './errorHandler.js'
import { httpLoggingPlugin } from './httpLoggingPlugin.js'
import { supertokensFastify } from './supertokensPlugin.js'

export interface FastifyAppBuilderOptions {
  websiteDomain: string
  registerRoutes: (app: FastifyInstance) => Promise<void> | void
}

export class FastifyAppBuilder {
  public static async build(options: FastifyAppBuilderOptions): Promise<FastifyInstance> {
    const app = Fastify({
      logger: false,
      ignoreTrailingSlash: true,
    })

    // Correlation IDs and HTTP logging must come first so they wrap everything downstream.
    await app.register(correlationIdPlugin)
    await app.register(httpLoggingPlugin)

    await app.register(formbody)

    await app.register(cors, {
      origin: options.websiteDomain,
      allowedHeaders: ['content-type', ...supertokens.getAllCORSHeaders()],
      credentials: true,
    })

    await app.register(supertokensFastify, { websiteDomain: options.websiteDomain })

    // SuperTokens registers its own error handler via the plugin; override with ours so app errors
    // (after the supertokens path-matcher) get our consistent DTO. SuperTokens' handler is still
    // invoked for its own routes through the framework integration.
    app.setErrorHandler(tacticaErrorHandler)

    await options.registerRoutes(app)

    app.setNotFoundHandler((request, reply) => {
      getLogger().debug('404', { method: request.method, url: request.url })
      void reply.status(404).send({ message: 'Endpoint not found', code: 'EndpointNotFoundError' })
    })

    return app
  }
}
