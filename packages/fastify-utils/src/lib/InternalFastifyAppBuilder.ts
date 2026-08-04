import { getLogger } from '@tactica/logging'
import Fastify, { type FastifyInstance } from 'fastify'
import { correlationIdPlugin } from './correlationIdPlugin.js'
import { tacticaErrorHandler } from './errorHandler.js'
import { httpLoggingPlugin } from './httpLoggingPlugin.js'

export interface InternalFastifyAppBuilderOptions {
  registerRoutes: (app: FastifyInstance) => Promise<void> | void
}

/**
 * App builder for internal, service-to-service backends (the engine and LLM services) — the same
 * shape as {@link FastifyAppBuilder} minus the two things only a browser-facing service needs:
 * SuperTokens session handling and CORS. Nothing in a browser talks to these, and they have no
 * `websiteDomain` to configure.
 *
 * What they do keep is what makes a call chain debuggable: an inbound `x-correlation-id` is adopted
 * (or generated) and threaded into every log line, so a request can be followed across services;
 * each request is logged once on completion; and thrown `ServerError`s serialize to the same
 * `{ message, code }` DTO every other service returns, so callers can branch on `code`.
 */
export class InternalFastifyAppBuilder {
  public static async build(options: InternalFastifyAppBuilderOptions): Promise<FastifyInstance> {
    const app = Fastify({
      logger: false,
      ignoreTrailingSlash: true,
    })

    // Correlation IDs and HTTP logging must come first so they wrap everything downstream.
    await app.register(correlationIdPlugin)
    await app.register(httpLoggingPlugin)

    app.setErrorHandler(tacticaErrorHandler)

    await options.registerRoutes(app)

    app.setNotFoundHandler((request, reply) => {
      getLogger().debug('404', { method: request.method, url: request.url })
      void reply.status(404).send({ message: 'Endpoint not found', code: 'EndpointNotFoundError' })
    })

    return app
  }
}
