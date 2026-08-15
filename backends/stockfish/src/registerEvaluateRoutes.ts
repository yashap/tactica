import { tacticaRequestValidationErrorHandler } from '@tactica/fastify-utils'
import { getLogger } from '@tactica/logging'
import { stockfishContract } from '@tactica/stockfish-contract'
import { initServer } from '@ts-rest/fastify'
import type { FastifyInstance } from 'fastify'
import { type UciEngine } from './UciEngine.js'

export const registerEvaluateRoutes = async (app: FastifyInstance, engine: UciEngine): Promise<void> => {
  const s = initServer()

  const router = s.router(stockfishContract, {
    health: async () => ({
      status: 200 as const,
      body: { status: 'ok' as const, engineRunning: engine.isRunning },
    }),
    evaluate: async ({ body }) => {
      const startedAt = Date.now()
      const result = await engine.evaluate(body)
      getLogger().info('Evaluated position', {
        movetimeMs: body.movetimeMs,
        multiPv: body.multiPv,
        elapsedMs: Date.now() - startedAt,
        bestMoveUci: result.bestMoveUci,
        lines: result.lines.length,
      })
      return { status: 200 as const, body: result }
    },
  })

  await app.register(s.plugin(router), {
    requestValidationErrorHandler: tacticaRequestValidationErrorHandler,
  })
}
