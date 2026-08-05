import cors from '@fastify/cors'
import formbody from '@fastify/formbody'
import { getLogger } from '@tactica/logging'
import Fastify, { type FastifyInstance } from 'fastify'
import supertokens from 'supertokens-node'
import { correlationIdPlugin } from './correlationIdPlugin.js'
import { tacticaErrorHandler } from './errorHandler.js'
import { httpLoggingPlugin } from './httpLoggingPlugin.js'
import { supertokensFastify } from './supertokensPlugin.js'

interface FastifyAppBuilderBaseOptions {
  registerRoutes: (app: FastifyInstance) => Promise<void> | void
}

/**
 * `kind` decides whether the browser-facing plugins get registered, and it's deliberately required
 * rather than defaulting: every service should state its posture out loud, because getting it wrong
 * on a user-facing service means serving it without session verification.
 *
 * CORS and SuperTokens are one switch rather than two because they're coupled — the CORS config
 * calls `supertokens.getAllCORSHeaders()`, which throws unless SuperTokens has been initialized. And
 * `websiteDomain` only exists on the `userFacing` branch, since it's the input both of them need and
 * there's nothing sensible for an internal service to pass.
 */
export type FastifyAppBuilderOptions = FastifyAppBuilderBaseOptions &
  (
    | {
        /** Serves the Expo app: CORS + SuperTokens session handling are registered. */
        kind: 'userFacing'
        websiteDomain: string
      }
    | {
        /** Service-to-service only (the engine and LLM services). No CORS, no SuperTokens. */
        kind: 'internal'
      }
  )

export class FastifyAppBuilder {
  public static async build(options: FastifyAppBuilderOptions): Promise<FastifyInstance> {
    const app = Fastify({
      logger: false,
      ignoreTrailingSlash: true,
      // Without this, `close()` waits for keep-alive sockets that are just sitting idle — a
      // healthcheck poller or a browser tab is enough to stall shutdown until the socket times out.
      // 'idle' closes those immediately while still letting in-flight requests finish.
      forceCloseConnections: 'idle',
    })

    // Correlation IDs and HTTP logging must come first so they wrap everything downstream. Both
    // kinds of service get them: an inbound `x-correlation-id` is what makes a call chain across
    // services followable in the logs.
    await app.register(correlationIdPlugin)
    await app.register(httpLoggingPlugin)

    await app.register(formbody)

    if (options.kind === 'userFacing') {
      await app.register(cors, {
        origin: options.websiteDomain,
        allowedHeaders: ['content-type', ...supertokens.getAllCORSHeaders()],
        credentials: true,
      })

      await app.register(supertokensFastify, { websiteDomain: options.websiteDomain })
    }

    // SuperTokens registers its own error handler via the plugin; override with ours so app errors
    // (after the supertokens path-matcher) get our consistent DTO. SuperTokens' handler is still
    // invoked for its own routes through the framework integration. Internal services have no
    // SuperTokens handler to override, but need ours just the same.
    app.setErrorHandler(tacticaErrorHandler)

    await options.registerRoutes(app)

    app.setNotFoundHandler((request, reply) => {
      getLogger().debug('404', { method: request.method, url: request.url })
      void reply.status(404).send({ message: 'Endpoint not found', code: 'EndpointNotFoundError' })
    })

    return app
  }
}
