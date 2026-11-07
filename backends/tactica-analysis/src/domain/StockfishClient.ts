import { stockfishContract } from '@tactica/stockfish-contract'
import { initClient } from '@ts-rest/core'
import { InternalServerError } from '@tactica/errors'

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
  evaluate(request: EvaluateRequest): Promise<EvaluateResult>
}

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

  public async evaluate(request: EvaluateRequest): Promise<EvaluateResult> {
    const response = await this.client.evaluate({ body: request })
    if (response.status !== 200) {
      throw new InternalServerError(
        `stockfish /evaluate failed with ${response.status}: ${JSON.stringify(response.body)}`,
      )
    }
    return response.body
  }
}
