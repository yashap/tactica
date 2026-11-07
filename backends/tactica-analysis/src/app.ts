import { buildRequireInternalApiKey, FastifyAppBuilder } from '@tactica/fastify-utils'
import type { FastifyInstance } from 'fastify'
import { type AnalysisRoutesDeps, registerAnalysisRoutes, registerHealthRoutes } from './registerAnalysisRoutes.js'

export interface AnalysisAppDeps extends AnalysisRoutesDeps {
  internalApiKey: string
}

/** The HTTP app, separate from `main.ts` so tests can drive it with `inject()`. */
export const buildApp = async (deps: AnalysisAppDeps): Promise<FastifyInstance> =>
  FastifyAppBuilder.build({
    kind: 'internal',
    registerRoutes: async (instance) => {
      await registerHealthRoutes(instance)
      // The key check is a hook on an encapsulated child scope, so it guards exactly the routes
      // registered inside it — by what the router matched, not by string-matching the raw URL.
      await instance.register(async (gated) => {
        gated.addHook('preHandler', buildRequireInternalApiKey(deps.internalApiKey))
        await registerAnalysisRoutes(gated, deps)
      })
    },
  })
