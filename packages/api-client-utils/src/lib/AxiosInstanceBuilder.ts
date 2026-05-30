import { buildServerErrorFromDto } from '@tactica/errors'
import axios, { type AxiosError, type AxiosInstance, type CreateAxiosDefaults } from 'axios'

const DEFAULT_TIMEOUT_MS = 60 * 1000

export type AxiosConfig = CreateAxiosDefaults & {
  baseURL: string
  token?: string
  locale?: string
}

export class AxiosInstanceBuilder {
  public static build({ headers, token, locale, timeout, ...rest }: AxiosConfig): AxiosInstance {
    const instance = axios.create({
      ...rest,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(headers && Object.fromEntries(Object.entries(headers))),
        ...(token && { Authorization: `Bearer ${token}` }),
        ...(locale && { 'Accept-Language': locale }),
      },
      timeout: timeout ?? DEFAULT_TIMEOUT_MS,
    })
    instance.interceptors.response.use(
      (response) => response,
      (error: unknown) => {
        const axiosError = error as AxiosError
        const status = axiosError.response?.status
        const payload = axiosError.response?.data
        if (status && payload) {
          throw buildServerErrorFromDto(payload, status)
        }
        throw error
      },
    )
    return instance
  }
}
