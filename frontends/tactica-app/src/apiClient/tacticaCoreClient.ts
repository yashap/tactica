import { AxiosInstanceBuilder } from '@tactica/api-client-utils'
import { TacticaCoreClient } from '@tactica/tactica-core-client'
import { config } from '../config'

const axiosInstance = AxiosInstanceBuilder.build({
  baseURL: config.tacticaCoreUrl,
  withCredentials: true,
})

export const tacticaCoreClient = new TacticaCoreClient(axiosInstance)
