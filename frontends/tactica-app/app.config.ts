import { type ExpoConfig } from 'expo/config'

export default (parentConfig: ExpoConfig): ExpoConfig => ({
  ...parentConfig,
  extra: {
    ...(parentConfig.extra ?? {}),
    tacticaCoreUrl: process.env['TACTICA_CORE_URL'] ?? 'http://localhost:3501',
  },
})
