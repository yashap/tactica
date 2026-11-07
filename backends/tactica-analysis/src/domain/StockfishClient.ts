import { CorrelationIdPropagator } from '@tactica/correlation-id-propagator'
import { InternalServerError } from '@tactica/errors'
import { stockfishContract } from '@tactica/stockfish-contract'
import { initClient } from '@ts-rest/core'

export interface EvaluateRequest {
  fen: string
  movetimeMs: number
  multiPv: number
}

export interface EngineLine {
  multipv: number
  depth: number
  pvUci: string[]
  cp?: number
  mate?: number
}

export interface EvaluateResult {
  bestMoveUci: string | null
  lines: EngineLine[]
}

/**
 * What {@link analyzeGame} needs from the engine. Narrow on purpose: it's the seam that lets the
 * analysis logic be tested exhaustively against scripted evaluations, with no container in sight.
 */
export interface StockfishEvaluator {
  /** `signal` cancels the request, e.g. when the job running it is abandoned. */
  evaluate(request: EvaluateRequest, signal?: AbortSignal): Promise<EvaluateResult>
}

/**
 * Headroom on top of the search time before a request counts as hung: queueing behind other
 * searches (the engine is single-slot), HTTP, and the engine's own wind-down.
 */
const REQUEST_GRACE_MS = 15_000

/**
 * Talks to the stockfish service. Scores come back **side-to-move-relative**, exactly as UCI reports
 * them — normalizing is this service's job (see `blunderDetection.toWhiteRelative`).
 *
 * Note the engine is a single-slot resource: it serializes searches internally, so issuing requests
 * concurrently buys nothing and just queues them.
 */
export class StockfishClient implements StockfishEvaluator {
  private readonly client: ReturnType<typeof initClient<typeof stockfishContract, never>>

  public constructor(baseUrl: string) {
    this.client = initClient(stockfishContract, { baseUrl, baseHeaders: {} })
  }

  public async evaluate(request: EvaluateRequest, signal?: AbortSignal): Promise<EvaluateResult> {
    // Without a timeout, a hung engine call would hold the job forever — past pg-boss's expiry, so
    // its retry would run concurrently with the original.
    const timeout = AbortSignal.timeout(request.movetimeMs + REQUEST_GRACE_MS)
    const correlationId = CorrelationIdPropagator.getContext()
    const response = await this.client.evaluate({
      body: request,
      ...(correlationId ? { extraHeaders: { 'x-correlation-id': correlationId } } : {}),
      fetchOptions: { signal: signal ? AbortSignal.any([signal, timeout]) : timeout },
    })
    if (response.status !== 200) {
      throw new InternalServerError(
        `stockfish /evaluate failed with ${response.status}: ${JSON.stringify(response.body)}`,
      )
    }
    return response.body
  }
}
