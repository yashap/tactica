import AsyncStorage from '@react-native-async-storage/async-storage'

/**
 * Persistent storage for SuperTokens session tokens. We're using header-based auth (server
 * issues tokens via `st-access-token` / `st-refresh-token` response headers; client attaches
 * `Authorization: Bearer <accessToken>` on subsequent requests). The same axios setup runs on
 * native and web, and AsyncStorage gives us a uniform async API:
 *
 *   - Native: AsyncStorage uses iOS Keychain-adjacent storage / Android SharedPreferences.
 *   - Web: AsyncStorage wraps `localStorage`.
 *
 * Tokens survive bundle reloads, but are wiped on signOut and on any unrecoverable 401.
 */

const ACCESS_KEY = 'tactica.accessToken'
const REFRESH_KEY = 'tactica.refreshToken'

export const tokenStorage = {
  getAccess: (): Promise<string | null> => AsyncStorage.getItem(ACCESS_KEY),
  getRefresh: (): Promise<string | null> => AsyncStorage.getItem(REFRESH_KEY),
  setTokens: async (access: string | null | undefined, refresh: string | null | undefined): Promise<void> => {
    if (typeof access === 'string' && access.length > 0) {
      await AsyncStorage.setItem(ACCESS_KEY, access)
    }
    if (typeof refresh === 'string' && refresh.length > 0) {
      await AsyncStorage.setItem(REFRESH_KEY, refresh)
    }
  },
  clear: (): Promise<void> => AsyncStorage.multiRemove([ACCESS_KEY, REFRESH_KEY]),
}
