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
import {
  type CreateTodoRequest,
  type SessionInfo,
  tacticaCoreContract,
  type Todo,
  type UpdateTodoRequest,
} from '@tactica/tactica-core-contract'

export class TacticaCoreClient {
  private readonly client: ApiClient<typeof tacticaCoreContract>

  public constructor(axiosInstance: ApiAxiosInstance) {
    this.client = ApiClientBuilder.build(tacticaCoreContract, axiosInstance)
  }

  public readonly session = {
    get: async (): Promise<SessionInfo | undefined> =>
      extractGetByIdResponse(this.client.session.get()) as Promise<SessionInfo | undefined>,
  }

  public readonly todos = {
    list: async (): Promise<Todo[]> => {
      const response = await extractListResponse(this.client.todos.list())
      return response.todos
    },

    get: async (id: string): Promise<Todo | undefined> =>
      extractGetByIdResponse(this.client.todos.get({ params: { id } })),

    create: async (request: CreateTodoRequest): Promise<Todo> =>
      extractPostResponse(this.client.todos.create({ body: request })),

    update: async (id: string, request: UpdateTodoRequest): Promise<Todo> =>
      extractPatchResponse(this.client.todos.update({ params: { id }, body: request })),

    delete: async (id: string): Promise<void> => extractDeleteResponse(this.client.todos.delete({ params: { id } })),
  }
}
