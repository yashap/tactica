import { extractGetByIdResponse, extractPostResponse } from '@tactica/api-client-utils'
import { type Analysis, type CreateAnalysisRequest, tacticaAnalysisContract } from '@tactica/tactica-analysis-contract'
import { initClient } from '@ts-rest/core'

export interface TacticaAnalysisClientOptions {
  baseUrl: string
  internalApiKey: string
  /**
   * Extra headers computed per request — how the caller forwards its correlation id, so the analysis
   * service's logs join the caller's trace. A callback rather than a dependency on the Node-only
   * context propagator, keeping this package runtime-agnostic.
   */
  requestHeaders?: () => Record<string, string>
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
  private readonly requestHeaders: () => Record<string, string>

  public constructor(options: TacticaAnalysisClientOptions) {
    this.requestHeaders = options.requestHeaders ?? (() => ({}))
    this.client = initClient(tacticaAnalysisContract, {
      baseUrl: options.baseUrl,
      baseHeaders: { 'x-internal-api-key': options.internalApiKey },
    })
  }

  /**
   * Queue a game. Returns immediately with a `queued` analysis — poll {@link get} for the result.
   * Pass an `idempotencyKey` to make retries safe: resubmitting returns the same analysis.
   */
  public async create(request: CreateAnalysisRequest): Promise<Analysis> {
    return extractPostResponse(this.client.create({ body: request, extraHeaders: this.requestHeaders() }))
  }

  /** `undefined` when the analysis doesn't exist. */
  public async get(id: string): Promise<Analysis | undefined> {
    return extractGetByIdResponse(this.client.get({ params: { id }, extraHeaders: this.requestHeaders() }))
  }
}
