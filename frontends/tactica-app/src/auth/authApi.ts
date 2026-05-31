import { buildServerErrorFromDto } from '@tactica/errors'
import axios, { type AxiosError, type AxiosInstance } from 'axios'
import { config } from '../config'

const buildAuthAxios = (): AxiosInstance => {
  const instance = axios.create({
    baseURL: config.tacticaCoreUrl,
    withCredentials: true,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', rid: 'emailpassword' },
    timeout: 30_000,
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

const authAxios = buildAuthAxios()

export type AuthFieldError = { id: string; error: string }

export interface AuthApiResult {
  status: 'OK' | 'FIELD_ERROR' | 'WRONG_CREDENTIALS_ERROR' | 'EMAIL_ALREADY_EXISTS_ERROR'
  formFields?: AuthFieldError[]
}

const callAuth = async (path: string, email: string, password: string): Promise<AuthApiResult> => {
  const response = await authAxios.post<AuthApiResult>(path, {
    formFields: [
      { id: 'email', value: email },
      { id: 'password', value: password },
    ],
  })
  return response.data
}

export const signUp = (email: string, password: string): Promise<AuthApiResult> =>
  callAuth('/auth/signup', email, password)

export const signIn = (email: string, password: string): Promise<AuthApiResult> =>
  callAuth('/auth/signin', email, password)

export const signOut = async (): Promise<void> => {
  await authAxios.post('/auth/signout')
}

export const fetchSession = async (): Promise<{ userId: string } | undefined> => {
  // Hit the dedicated session endpoint — lightweight, doesn't trigger a todos refetch on every
  // page load, and returns the SuperTokens user id directly.
  try {
    const response = await authAxios.get<{ userId: string }>('/tactica-core/session')
    return response.data
  } catch {
    return undefined
  }
}
