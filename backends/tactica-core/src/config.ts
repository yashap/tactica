import { required } from '@tactica/errors'

const env = (key: string, fallback?: string): string => {
  const value = process.env[key] ?? fallback
  return required(value, `Missing required env var: ${key}`)
}

export const config = {
  port: Number(env('PORT', '3501')),
  host: env('HOST_NAME', '0.0.0.0'),
  websiteDomain: env('TACTICA_WEB_URL', 'http://localhost:8081'),
  apiDomain: env('TACTICA_CORE_URL', 'http://localhost:3501'),
  databaseUrl: env(
    'DATABASE_URL',
    'postgres://tactica_core:tactica_core_password@localhost:5440/tactica_core?sslmode=disable',
  ),
  supertokens: {
    connectionUri: env('SUPERTOKENS_CORE_URL', 'http://localhost:3567'),
    apiKey: process.env['SUPERTOKENS_API_KEY'],
  },
} as const
