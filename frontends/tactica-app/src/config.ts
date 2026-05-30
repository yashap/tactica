import Constants from 'expo-constants'

interface ExtraConfig {
  tacticaCoreUrl: string
}

const extra = (Constants.expoConfig?.extra ?? {}) as Partial<ExtraConfig>

export const config = {
  tacticaCoreUrl: extra.tacticaCoreUrl ?? 'http://localhost:3501',
}
