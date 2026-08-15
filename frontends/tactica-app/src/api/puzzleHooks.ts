import { useQuery } from '@tanstack/react-query'
import { tacticaCoreClient } from './tacticaCoreClient'

export const PUZZLES_QUERY_KEY = ['puzzles']

/**
 * The user's puzzles, newest first. Polled while analysis is still producing them so the list fills
 * in without a manual refresh; `analysisInProgress` comes from the account's stats.
 */
export const usePuzzles = (options: { analysisInProgress: boolean }) =>
  useQuery({
    queryKey: PUZZLES_QUERY_KEY,
    queryFn: () => tacticaCoreClient.puzzles.list(),
    refetchInterval: options.analysisInProgress ? 3000 : false,
  })

export const usePuzzle = (id: string | undefined) =>
  useQuery({
    queryKey: [...PUZZLES_QUERY_KEY, id],
    queryFn: () => tacticaCoreClient.puzzles.get(id!),
    enabled: id !== undefined,
  })
