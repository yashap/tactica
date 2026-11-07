import {
  type ApiAxiosInstance,
  type ApiClient,
  ApiClientBuilder,
  extractDeleteResponse,
  extractGetByIdResponse,
  extractListResponse,
  extractPatchResponse,
  extractPostResponse,
} from '@tactica/api-client-utils'
import { type PaginationRequestDto } from '@tactica/pagination'
import {
  type CreateGameAccountRequest,
  type Game,
  type GameAccountWithStats,
  type GameWithPgn,
  type Puzzle,
  type SessionInfo,
  tacticaCoreContract,
} from '@tactica/tactica-core-contract'

export interface PaginatedGames {
  data: Game[]
  pagination: { next?: string; previous?: string }
}

export interface PaginatedPuzzles {
  data: Puzzle[]
  pagination: { next?: string; previous?: string }
}

export class TacticaCoreClient {
  private readonly client: ApiClient<typeof tacticaCoreContract>

  public constructor(axiosInstance: ApiAxiosInstance) {
    this.client = ApiClientBuilder.build(tacticaCoreContract, axiosInstance)
  }

  public readonly session = {
    get: async (): Promise<SessionInfo | undefined> =>
      extractGetByIdResponse(this.client.session.get()) as Promise<SessionInfo | undefined>,
  }

  public readonly gameAccounts = {
    list: async (): Promise<GameAccountWithStats[]> => {
      const response = await extractListResponse(this.client.gameAccounts.list())
      return response.gameAccounts
    },

    get: async (id: string): Promise<GameAccountWithStats | undefined> =>
      extractGetByIdResponse(this.client.gameAccounts.get({ params: { id } })),

    create: async (request: CreateGameAccountRequest): Promise<GameAccountWithStats> =>
      extractPostResponse(this.client.gameAccounts.create({ body: request })),

    sync: async (id: string): Promise<GameAccountWithStats> =>
      extractPatchResponse(this.client.gameAccounts.sync({ params: { id }, body: {} })),

    delete: async (id: string): Promise<void> =>
      extractDeleteResponse(this.client.gameAccounts.delete({ params: { id } })),
  }

  public readonly games = {
    list: async (pagination: PaginationRequestDto = {}): Promise<PaginatedGames> =>
      extractListResponse(this.client.games.list({ query: pagination })),

    get: async (id: string): Promise<GameWithPgn | undefined> =>
      extractGetByIdResponse(this.client.games.get({ params: { id } })),
  }

  public readonly puzzles = {
    list: async (pagination: PaginationRequestDto = {}): Promise<PaginatedPuzzles> =>
      extractListResponse(this.client.puzzles.list({ query: pagination })),

    get: async (id: string): Promise<Puzzle | undefined> =>
      extractGetByIdResponse(this.client.puzzles.get({ params: { id } })),
  }
}
