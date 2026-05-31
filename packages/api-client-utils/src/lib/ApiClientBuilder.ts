import { required } from '@tactica/errors'
import { type AppRouter, type ClientArgs, type InitClientReturn, initClient } from '@ts-rest/core'

type TsRestClientArgs = Required<Pick<ClientArgs, 'baseUrl' | 'baseHeaders' | 'api'>>
export type ApiClient<C extends AppRouter> = InitClientReturn<C, TsRestClientArgs>

export interface ApiAxiosInstance {
  request: (config: ApiAxiosRequest) => Promise<ApiAxiosResponse>
  defaults: { baseURL?: string }
}

export interface ApiAxiosRequest {
  method: string
  url: string
  headers: Record<string, string>
  data: unknown
}

export interface ApiAxiosResponse {
  status: number
  data: unknown
  headers: unknown
}

export class ApiClientBuilder {
  public static build<C extends AppRouter>(contract: C, axiosInstance: ApiAxiosInstance): ApiClient<C> {
    return initClient(contract, {
      baseUrl: required(axiosInstance.defaults.baseURL, 'Axios instance must have a baseURL set'),
      baseHeaders: {},
      api: async ({ path, method, headers, body }) => {
        const response = await axiosInstance.request({
          method,
          url: path,
          headers,
          data: body,
        })
        const responseHeaders = new Headers()
        if (response.headers && typeof response.headers === 'object') {
          for (const [key, value] of Object.entries(response.headers as Record<string, unknown>)) {
            if (typeof value === 'string') responseHeaders.set(key, value)
          }
        }
        return {
          status: response.status,
          body: response.data,
          headers: responseHeaders,
        }
      },
    })
  }
}
