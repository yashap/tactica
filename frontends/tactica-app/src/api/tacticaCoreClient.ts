import { type ApiAxiosInstance } from '@tactica/api-client-utils'
import { TacticaCoreClient } from '@tactica/tactica-core-client'
import { buildTacticaAxios } from '../auth/buildTacticaAxios'

/**
 * The shared typed API client. Built on the same interceptor-laden axios instance as the auth
 * calls, so token attach/rotation/refresh all apply to API calls for free.
 */
export const tacticaCoreClient = new TacticaCoreClient(buildTacticaAxios() as ApiAxiosInstance)
