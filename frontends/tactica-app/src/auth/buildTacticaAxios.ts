import { buildServerErrorFromDto } from '@tactica/errors'
import axios, { type AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios'
import { config } from '../config'
import { notifyAuthLost } from './authEvents'
import { tokenStorage } from './tokenStorage'

const REFRESH_PATH = '/auth/session/refresh'

/**
 * Header-based auth, uniform across web and native.
 *
 * - Request interceptor signals `st-auth-mode: header` (SuperTokens uses this to pick header
 *   transfer over cookies) and attaches `Authorization: Bearer <accessToken>` when we have one.
 * - Response interceptor scrapes rotated tokens from `st-access-token` / `st-refresh-token`
 *   response headers and persists them via `tokenStorage`.
 * - Refresh interceptor catches 401 `try refresh token`, calls `POST /auth/session/refresh`
 *   with the refresh token, captures the rotated tokens, retries the original request.
 * - Anything else 401 → notifyAuthLost (so the UI flips to logged-out cleanly).
 * - Final interceptor wraps any uncaught axios errors into our typed `ServerError`.
 */

const TRY_REFRESH_TOKEN_MESSAGE = 'try refresh token'

interface RetryableConfig extends InternalAxiosRequestConfig {
  _tacticaRefreshAttempted?: boolean
  _tacticaSkipAuthHeader?: boolean
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

/**
 * Pull a header value off axios's response headers regardless of whether the underlying
 * `headers` is an `AxiosHeaders` instance, a plain object, or a `Headers` instance.
 */
const readHeader = (headers: unknown, name: string): string | undefined => {
  if (!headers) return undefined
  if (typeof (headers as { get?: unknown }).get === 'function') {
    const value = (headers as { get: (n: string) => string | null }).get(name)
    return value ?? undefined
  }
  const lower = name.toLowerCase()
  const record = headers as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (key.toLowerCase() === lower) {
      const value = record[key]
      return typeof value === 'string' ? value : undefined
    }
  }
  return undefined
}

const attachRequestInterceptor = (instance: AxiosInstance): void => {
  instance.interceptors.request.use(async (requestConfig) => {
    const typed = requestConfig as RetryableConfig
    requestConfig.headers.set('st-auth-mode', 'header')

    if (typed._tacticaSkipAuthHeader) return requestConfig

    const accessToken = await tokenStorage.getAccess()
    if (accessToken) {
      requestConfig.headers.set('Authorization', `Bearer ${accessToken}`)
    }
    return requestConfig
  })
}

const attachTokenCaptureInterceptor = (instance: AxiosInstance): void => {
  const capture = async (headers: unknown): Promise<void> => {
    const access = readHeader(headers, 'st-access-token')
    const refresh = readHeader(headers, 'st-refresh-token')
    if (access || refresh) {
      await tokenStorage.setTokens(access, refresh)
    }
  }

  instance.interceptors.response.use(
    async (response) => {
      await capture(response.headers)
      return response
    },
    async (error: unknown) => {
      // Even failed responses can carry rotated tokens (e.g. 401 try-refresh-token responses
      // sometimes include a fresh front-token). Capture before rethrowing.
      const axiosError = error as AxiosError
      if (axiosError.response?.headers) {
        await capture(axiosError.response.headers)
      }
      throw error
    },
  )
}

const attachRefreshInterceptor = (instance: AxiosInstance): void => {
  let inFlightRefresh: Promise<boolean> | null = null

  const refresh = async (): Promise<boolean> => {
    if (!inFlightRefresh) {
      inFlightRefresh = (async () => {
        const refreshToken = await tokenStorage.getRefresh()
        if (!refreshToken) return false
        try {
          await instance.post(REFRESH_PATH, undefined, {
            headers: { Authorization: `Bearer ${refreshToken}` },
            // Skip the default Authorization-from-storage attachment — the refresh endpoint
            // requires the refresh token specifically. Skip refresh retry too.
            _tacticaSkipAuthHeader: true,
            _tacticaRefreshAttempted: true,
          } as RetryableConfig)
          return true
        } catch {
          return false
        }
      })().finally(() => {
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
      // Drop any stale Authorization the request was built with; the request interceptor will
      // reattach the freshly-rotated access token from storage on the retry.
      requestConfig.headers?.delete?.('Authorization')
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
 * Interceptor ordering (response interceptors run in the order they're added on the success
 * path, last-added-first on the error path — Axios docs):
 *
 *   request:  attach `st-auth-mode` + `Authorization` from storage
 *   response: capture rotated tokens → refresh+retry on 401 → transform AxiosError → ServerError
 */
export const buildTacticaAxios = (extraHeaders?: Record<string, string>): AxiosInstance => {
  const instance = axios.create({
    baseURL: config.tacticaCoreUrl,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(extraHeaders ?? {}),
    },
    timeout: 30_000,
  })
  attachRequestInterceptor(instance)
  attachTokenCaptureInterceptor(instance)
  attachRefreshInterceptor(instance)
  attachErrorTransformInterceptor(instance)
  return instance
}
