import { buildServerErrorFromDto } from '@tactica/errors'
import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'
import { config } from '../config'
import { notifyAuthLost } from './authEvents'

const REFRESH_PATH = '/auth/session/refresh'

/**
 * SuperTokens returns 401 with this body when the access token has expired but the refresh token
 * is still valid. The contract is: client calls POST /auth/session/refresh to mint a new access
 * token, then retries the original request. We do that transparently here.
 */
const TRY_REFRESH_TOKEN_MESSAGE = 'try refresh token'

interface RetryableConfig extends InternalAxiosRequestConfig {
  _tacticaRefreshAttempted?: boolean
}

const needsRefresh = (error: AxiosError): boolean => {
  if (error.response?.status !== 401) return false
  const body = error.response.data
  if (typeof body === 'string') return body.trim() === TRY_REFRESH_TOKEN_MESSAGE
  if (body && typeof body === 'object') {
    return (body as { message?: unknown }).message === TRY_REFRESH_TOKEN_MESSAGE
  }
  return false
}

const attachRefreshInterceptor = (instance: AxiosInstance): void => {
  // Dedupe concurrent refresh attempts — if 5 requests all 401 at once, we only want one
  // POST /auth/session/refresh going out.
  let inFlightRefresh: Promise<boolean> | null = null
  const refresh = async (): Promise<boolean> => {
    if (!inFlightRefresh) {
      inFlightRefresh = instance
        .post(REFRESH_PATH, undefined, { _tacticaRefreshAttempted: true } as Partial<RetryableConfig>)
        .then(() => true)
        .catch(() => false)
        .finally(() => {
          inFlightRefresh = null
        })
    }
    return inFlightRefresh
  }

  instance.interceptors.response.use(
    (response) => response,
    async (error: unknown) => {
      const axiosError = error as AxiosError
      const requestConfig = axiosError.config as RetryableConfig | undefined
      const status = axiosError.response?.status

      // No config to retry against, or we already retried, or it's not the "try refresh" signal —
      // propagate the error. If the failure was a 401 we still consider the session lost so the
      // UI can flip to logged-out (covers server-revoked sessions, missing cookies, etc.).
      if (!requestConfig || requestConfig._tacticaRefreshAttempted || !needsRefresh(axiosError)) {
        if (status === 401) notifyAuthLost()
        throw error
      }

      const refreshed = await refresh()
      if (!refreshed) {
        notifyAuthLost()
        throw error
      }
      requestConfig._tacticaRefreshAttempted = true
      return instance.request(requestConfig)
    },
  )
}

const attachErrorTransformInterceptor = (instance: AxiosInstance): void => {
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
}

/**
 * Build the shared axios instance used by every FE call to tactica-core (auth endpoints + API).
 * Two response interceptors are attached, in order:
 *   1. SuperTokens refresh — catches 401 "try refresh token", refreshes, retries.
 *   2. Error → ServerError transform — wraps any remaining axios errors into our typed errors.
 *
 * Order matters: refresh must see the raw AxiosError (with the original request config) BEFORE
 * the transform discards it.
 */
export const buildTacticaAxios = (extraHeaders?: Record<string, string>): AxiosInstance => {
  const instance = axios.create({
    baseURL: config.tacticaCoreUrl,
    withCredentials: true,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(extraHeaders ?? {}),
    },
    timeout: 30_000,
  })
  attachRefreshInterceptor(instance)
  attachErrorTransformInterceptor(instance)
  return instance
}
