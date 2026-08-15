import { type Puzzle } from '@tactica/tactica-core-contract'
import { Link } from 'expo-router'
import React from 'react'
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native'
import { useGameAccounts } from '../../../api/gameAccountHooks'
import { usePuzzles } from '../../../api/puzzleHooks'

const SEVERITY_LABEL: Record<Puzzle['severity'], string> = {
  blunder: 'Blunder',
  mistake: 'Mistake',
  inaccuracy: 'Inaccuracy',
}

const PuzzleRow: React.FC<{ puzzle: Puzzle }> = ({ puzzle }) => (
  <Link href={`/puzzles/${puzzle.id}`} asChild>
    {/* Keyed by opponent as well as id: e2e needs to pick a *specific* puzzle, and ids are random */}
    <Pressable testID={`puzzleRow-${puzzle.opponentUsername}`} style={styles.row}>
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle}>
          {SEVERITY_LABEL[puzzle.severity]} vs {puzzle.opponentUsername}
        </Text>
        <Text style={styles.rowSub}>
          Playing {puzzle.playerColor} · move {Math.floor(puzzle.ply / 2) + 1} ·{' '}
          {new Date(puzzle.playedAt).toLocaleDateString()}
        </Text>
      </View>
      {puzzle.solved ? (
        <Text testID={`puzzleSolvedBadge-${puzzle.id}`} style={styles.solvedBadge}>
          ✓ Solved
        </Text>
      ) : (
        <Text style={styles.unsolvedBadge}>Unsolved</Text>
      )}
    </Pressable>
  </Link>
)

const PuzzlesScreen: React.FC = () => {
  const accounts = useGameAccounts()
  // Analysis fills this list in over time, so keep polling while games are still queued
  const analysisInProgress = (accounts.data ?? []).some((account) => account.stats.gamesPendingAnalysis > 0)
  const puzzles = usePuzzles({ analysisInProgress })

  return (
    <View style={styles.container} testID="puzzlesScreen">
      {puzzles.isPending ? (
        <ActivityIndicator />
      ) : puzzles.error ? (
        <Text style={styles.error}>{puzzles.error.message}</Text>
      ) : (puzzles.data?.data.length ?? 0) === 0 ? (
        <View style={styles.empty} testID="puzzlesEmptyState">
          <Text style={styles.emptyTitle}>No puzzles yet</Text>
          <Text style={styles.emptySub}>
            {analysisInProgress
              ? 'Analyzing your games — puzzles will appear here as they’re found.'
              : 'Link a chess.com account in Settings and we’ll turn your mistakes into puzzles.'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={puzzles.data?.data ?? []}
          keyExtractor={(puzzle) => puzzle.id}
          renderItem={({ item }) => <PuzzleRow puzzle={item} />}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, width: '100%', maxWidth: 560, alignSelf: 'center' },
  list: { gap: 10 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    padding: 14,
    gap: 12,
  },
  rowMain: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 16, fontWeight: '600' },
  rowSub: { fontSize: 13, color: '#6E675D' },
  solvedBadge: { color: '#1a7f37', fontWeight: '600' },
  unsolvedBadge: { color: '#6E675D' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptySub: { fontSize: 14, color: '#6E675D', textAlign: 'center' },
  error: { color: 'red' },
})

export default PuzzlesScreen
