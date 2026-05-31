/**
 * Side-channel between the axios layer and AuthContext. The axios interceptor in
 * `buildTacticaAxios.ts` calls `notifyAuthLost()` whenever it sees a 401 it can't recover from
 * (refresh failed, server-side session revoked, no session at all). AuthContext registers a
 * handler on mount that flips state to `logged-out` and clears the React Query cache, which lets
 * the (app)/_layout redirect to /logIn automatically.
 *
 * The indirection avoids coupling axios to React state directly.
 */
type AuthLostHandler = () => void

let handler: AuthLostHandler | null = null

export const setAuthLostHandler = (next: AuthLostHandler | null): void => {
  handler = next
}

export const notifyAuthLost = (): void => {
  handler?.()
}
