import { extractGetByIdResponse, extractPostResponse } from '@tactica/api-client-utils'
import { type Analysis, type CreateAnalysisRequest, tacticaAnalysisContract } from '@tactica/tactica-analysis-contract'
import { initClient } from '@ts-rest/core'

export interface TacticaAnalysisClientOptions {
  baseUrl: string
  internalApiKey: string
}

/**
 * Typed client for the analysis service, used by tactica-core's `analyze-game` job.
 *
 * Uses ts-rest's built-in fetch client rather than the axios-based `ApiClientBuilder`: there are no
 * session tokens to refresh here, just a static internal-key header, so axios and its interceptor
 * stack would be machinery for nothing.
 */
export class TacticaAnalysisClient {
  private readonly client: ReturnType<typeof initClient<typeof tacticaAnalysisContract, never>>

  public constructor(options: TacticaAnalysisClientOptions) {
    this.client = initClient(tacticaAnalysisContract, {
      baseUrl: options.baseUrl,
      baseHeaders: { 'x-internal-api-key': options.internalApiKey },
    })
  }

  /** Queue a game. Returns immediately with a `queued` analysis — poll {@link get} for the result. */
  public async create(request: CreateAnalysisRequest): Promise<Analysis> {
    return extractPostResponse(this.client.create({ body: request }))
  }

  /** `undefined` when the analysis doesn't exist. */
  public async get(id: string): Promise<Analysis | undefined> {
    return extractGetByIdResponse(this.client.get({ params: { id } }))
  }
}
