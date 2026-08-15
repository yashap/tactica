import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { type CreateGameAccountRequest, type GameAccountWithStats } from '@tactica/tactica-core-contract'
import { tacticaCoreClient } from './tacticaCoreClient'

const GAME_ACCOUNTS_KEY = ['gameAccounts']

/** How often to poll while an import is running, so progress counts tick up live. */
const SYNC_POLL_INTERVAL_MS = 2500

/**
 * True while there is still background work to reflect: an import in flight, or games imported but
 * not yet analysed. Analysis runs long after the import finishes, so polling has to outlast it.
 */
const anyWorkInProgress = (accounts: GameAccountWithStats[] | undefined): boolean =>
  (accounts ?? []).some(
    (account) => account.stats.syncActive || account.stats.gamesAnalyzed < account.stats.gamesImported,
  )

/**
 * The user's linked game accounts. Polls while any account has work in flight (importing, or games
 * still queued for analysis), then goes quiet once everything has settled.
 */
export const useGameAccounts = () =>
  useQuery({
    queryKey: GAME_ACCOUNTS_KEY,
    queryFn: () => tacticaCoreClient.gameAccounts.list(),
    refetchInterval: (query) => (anyWorkInProgress(query.state.data) ? SYNC_POLL_INTERVAL_MS : false),
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
