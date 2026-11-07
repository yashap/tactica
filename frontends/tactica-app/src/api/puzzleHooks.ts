import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { tacticaCoreClient } from './tacticaCoreClient'

export const PUZZLES_QUERY_KEY = ['puzzles']

const PUZZLES_PAGE_SIZE = 25

/**
 * The user's puzzles, a page at a time, from their most recently *played* games first — the
 * mistakes they're likeliest to remember. Call `fetchNextPage` for more (the list does on scroll).
 * Polled while analysis is still producing them so the list fills in without a manual refresh;
 * `analysisInProgress` comes from the account's stats.
 */
export const usePuzzles = (options: { analysisInProgress: boolean }) =>
  useInfiniteQuery({
    queryKey: PUZZLES_QUERY_KEY,
    queryFn: ({ pageParam }) =>
      tacticaCoreClient.puzzles.list(
        pageParam === undefined
          ? { limit: PUZZLES_PAGE_SIZE, orderBy: 'playedAt', orderDirection: 'desc' }
          : { cursor: pageParam },
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.pagination.next,
    refetchInterval: options.analysisInProgress ? 3000 : false,
  })

/** `null` when the puzzle doesn't exist (React Query won't cache `undefined`). */
export const usePuzzle = (id: string | undefined) =>
  useQuery({
    queryKey: [...PUZZLES_QUERY_KEY, id],
    queryFn: async () => (await tacticaCoreClient.puzzles.get(id!)) ?? null,
    enabled: id !== undefined,
  })

/**
 * Record an attempt. The board already showed the verdict locally, so this isn't in the critical
 * path — but the server grades it independently, and its answer is what marks the puzzle solved, so
 * invalidate the list afterwards to pick up the badge.
 */
export const useSubmitPuzzleAttempt = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ puzzleId, moveUci }: { puzzleId: string; moveUci: string }) =>
      tacticaCoreClient.puzzles.createAttempt(puzzleId, { moveUci }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: PUZZLES_QUERY_KEY }),
  })
}
