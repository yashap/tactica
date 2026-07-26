import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type CreateGameAccountRequest, type GameAccountWithStats } from '@tactica/tactica-core-contract'
import { tacticaCoreClient } from './tacticaCoreClient'

const GAME_ACCOUNTS_KEY = ['gameAccounts']

/** How often to poll while an import is running, so progress counts tick up live. */
const SYNC_POLL_INTERVAL_MS = 2500

const anySyncActive = (accounts: GameAccountWithStats[] | undefined): boolean =>
  (accounts ?? []).some((account) => account.stats.syncActive)

/**
 * The user's linked game accounts. Polls while any account has an active import, then goes
 * quiet once everything is synced.
 */
export const useGameAccounts = () =>
  useQuery({
    queryKey: GAME_ACCOUNTS_KEY,
    queryFn: () => tacticaCoreClient.gameAccounts.list(),
    refetchInterval: (query) => (anySyncActive(query.state.data) ? SYNC_POLL_INTERVAL_MS : false),
  })

export const useLinkGameAccount = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (request: CreateGameAccountRequest) => tacticaCoreClient.gameAccounts.create(request),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GAME_ACCOUNTS_KEY }),
  })
}

export const useSyncGameAccount = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => tacticaCoreClient.gameAccounts.sync(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GAME_ACCOUNTS_KEY }),
  })
}

export const useUnlinkGameAccount = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => tacticaCoreClient.gameAccounts.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GAME_ACCOUNTS_KEY }),
  })
}
