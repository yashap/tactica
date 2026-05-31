import { type ConfigContext, type ExpoConfig } from 'expo/config'

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...(config as ExpoConfig),
  extra: {
    ...(config.extra ?? {}),
    tacticaCoreUrl: process.env['TACTICA_CORE_URL'] ?? 'http://localhost:3501',
  },
})
