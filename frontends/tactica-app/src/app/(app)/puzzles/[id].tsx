import { type Puzzle } from '@tactica/tactica-core-contract'
import { router, useLocalSearchParams } from 'expo-router'
import React, { useCallback, useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { usePuzzle as usePuzzleQuery, useSubmitPuzzleAttempt } from '../../../api/puzzleHooks'
import { Chessboard } from '../../../chess/Chessboard'
import { usePuzzle } from '../../../puzzle/usePuzzle'

/**
 * One attempt at a puzzle. Mounted with a `key` by the screen so "Try again" remounts it — the
 * board's position is fixed at mount, so a remount is the cleanest possible reset.
 */
const PuzzleAttempt: React.FC<{ puzzle: Puzzle; onRetry: () => void }> = ({ puzzle, onRetry }) => {
  const submitAttempt = useSubmitPuzzleAttempt()
  const onAttempt = useCallback(
    (moveUci: string) => {
      // Fire-and-forget: the local grade already drove the UI, and this is what records the result.
      submitAttempt.mutate({ puzzleId: puzzle.id, moveUci })
    },
    [puzzle.id, submitAttempt],
  )
  const session = usePuzzle(puzzle, { onAttempt })

  return (
    <View style={styles.attempt}>
      <View style={styles.prompt}>
        <Text style={styles.promptTitle} testID="puzzlePrompt">
          {session.outcome === 'unsolved'
            ? `You played ${puzzle.playedMoveSan} here. Find the better move.`
            : session.outcome === 'correct'
              ? 'Correct!'
              : 'Not quite'}
        </Text>
        <Text style={styles.promptSub}>
          Playing {puzzle.playerColor} vs {puzzle.opponentUsername}
        </Text>
      </View>

      <Chessboard game={session.game} orientation={session.orientation} />

      {/* Always takes the same space, so the board doesn't shift when the verdict appears */}
      <View style={styles.resultArea}>
        {session.outcome === 'correct' && (
          <View style={styles.result} testID="puzzleSuccess">
            <Text style={styles.successText}>
              {/* Their move, not the engine's top pick: any near-equal alternative also counts */}
              {session.attemptedMoveSan ?? puzzle.bestMoveSan} — much better than {puzzle.playedMoveSan}
            </Text>
          </View>
        )}

        {session.outcome === 'incorrect' && (
          <View style={styles.result} testID="puzzleFailure">
            <Text style={styles.failureText}>
              You played {puzzle.playedMoveSan} in the game; the best move was {puzzle.bestMoveSan}.
            </Text>
            <Pressable testID="puzzleRetryButton" onPress={onRetry} style={styles.retryButton}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Coach explanation lands here in M6, once either terminal state is reached */}
    </View>
  )
}

/** Back to the list — or, after a deep link with nothing to go back to, straight to it. */
const goBackToList = (): void => {
  if (router.canGoBack()) router.back()
  else router.replace('/puzzles')
}

const PuzzleScreen: React.FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>()
  const puzzle = usePuzzleQuery(id)
  const [attemptKey, setAttemptKey] = useState(0)
  const onRetry = useCallback(() => setAttemptKey((key) => key + 1), [])

  return (
    <View style={styles.container} testID="puzzleScreen">
      <Pressable testID="puzzleBackButton" onPress={goBackToList} style={styles.backButton} hitSlop={8}>
        <Text style={styles.backText}>‹ All puzzles</Text>
      </Pressable>
      {/* Data before error: a failed *background* refetch keeps the cached puzzle, and swapping the
          board for an error message mid-solve would throw away the attempt in progress */}
      {puzzle.data ? (
        <PuzzleAttempt key={attemptKey} puzzle={puzzle.data} onRetry={onRetry} />
      ) : puzzle.isPending ? (
        <ActivityIndicator />
      ) : puzzle.error ? (
        <Text style={styles.error}>{puzzle.error.message}</Text>
      ) : (
        <Text style={styles.error}>Puzzle not found</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12 },
  attempt: { flex: 1, width: '100%', maxWidth: 560, alignSelf: 'center' },
  // Room for a two-line prompt, so a shorter verdict ("Correct!") doesn't shift the board
  prompt: { gap: 4, marginBottom: 8, alignItems: 'center', justifyContent: 'center', minHeight: 64 },
  promptTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  promptSub: { fontSize: 13, color: '#6E675D' },
  resultArea: { minHeight: 96 },
  result: { alignItems: 'center', gap: 10, marginTop: 12 },
  backButton: { alignSelf: 'flex-start', paddingVertical: 4, marginBottom: 4 },
  backText: { color: '#1f6feb', fontSize: 15 },
  successText: { fontSize: 16, fontWeight: '600', color: '#1a7f37', textAlign: 'center' },
  failureText: { fontSize: 15, color: '#c0392b', textAlign: 'center' },
  retryButton: {
    borderWidth: 1,
    borderColor: '#1f6feb',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 20,
  },
  retryText: { color: '#1f6feb', fontWeight: '600' },
  error: { color: 'red' },
})

export default PuzzleScreen
