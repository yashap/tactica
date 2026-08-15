import { type GameAccountWithStats } from '@tactica/tactica-core-contract'
import React, { useState } from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native'
import {
  useGameAccounts,
  useLinkGameAccount,
  useSyncGameAccount,
  useUnlinkGameAccount,
} from '../../api/gameAccountHooks'

/** Form for linking a chess.com account by username. */
const LinkChessComForm: React.FC = () => {
  const [username, setUsername] = useState('')
  const link = useLinkGameAccount()

  const onSubmit = (): void => {
    if (username.trim().length === 0) return
    link.mutate({ source: 'chesscom', externalUsername: username.trim() })
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Link your chess.com account</Text>
      <Text style={styles.cardSub}>
        We’ll import your recent games and turn your mistakes into personalized puzzles.
      </Text>
      <TextInput
        testID="chesscomUsernameInput"
        style={styles.input}
        placeholder="chess.com username"
        autoCapitalize="none"
        autoCorrect={false}
        value={username}
        onChangeText={setUsername}
      />
      {link.error && (
        <Text testID="linkError" style={styles.error}>
          {link.error.message}
        </Text>
      )}
      <Pressable testID="linkChesscomButton" style={styles.button} onPress={onSubmit} disabled={link.isPending}>
        <Text style={styles.buttonText}>{link.isPending ? 'Linking...' : 'Link account'}</Text>
      </Pressable>
    </View>
  )
}

/** Details + sync controls for an already-linked account. */
const LinkedAccountCard: React.FC<{ account: GameAccountWithStats }> = ({ account }) => {
  const sync = useSyncGameAccount()
  const unlink = useUnlinkGameAccount()
  const { stats } = account
  // Straight from the server: games still queued or in flight. Not derived from
  // imported - analyzed, which would count a failed analysis as pending forever.
  const analysisPending = stats.gamesPendingAnalysis

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>chess.com</Text>
      <Text testID="linkedUsername" style={styles.username}>
        {account.externalUsername}
      </Text>
      <Text testID="gamesImportedText" style={styles.stat}>
        {stats.gamesImported} {stats.gamesImported === 1 ? 'game' : 'games'} imported
      </Text>
      <Text testID="gamesAnalyzedText" style={styles.stat}>
        {stats.gamesAnalyzed} analyzed
        {analysisPending > 0 ? ` · ${analysisPending} to go` : ''}
      </Text>
      <Text testID="puzzleCountText" style={styles.stat}>
        {stats.puzzleCount} {stats.puzzleCount === 1 ? 'puzzle' : 'puzzles'} found
      </Text>
      {stats.syncActive ? (
        <View style={styles.syncRow} testID="syncActiveIndicator">
          <ActivityIndicator size="small" color="#D9A441" />
          <Text style={styles.syncText}>Importing games…</Text>
        </View>
      ) : analysisPending > 0 ? (
        <View style={styles.syncRow} testID="analysisActiveIndicator">
          <ActivityIndicator size="small" color="#D9A441" />
          <Text style={styles.syncText}>Analyzing games for blunders…</Text>
        </View>
      ) : (
        <Text style={styles.syncedText} testID="syncIdleIndicator">
          {account.lastSyncedAt ? `Last synced ${new Date(account.lastSyncedAt).toLocaleString()}` : 'Not synced yet'}
        </Text>
      )}
      <View style={styles.actionsRow}>
        <Pressable
          testID="syncNowButton"
          style={[styles.button, styles.secondaryButton]}
          onPress={() => sync.mutate(account.id)}
          disabled={sync.isPending || stats.syncActive}
        >
          <Text style={styles.secondaryButtonText}>Sync now</Text>
        </Pressable>
        <Pressable
          testID="unlinkButton"
          style={[styles.button, styles.dangerButton]}
          onPress={() => unlink.mutate(account.id)}
          disabled={unlink.isPending}
        >
          <Text style={styles.dangerButtonText}>Unlink</Text>
        </Pressable>
      </View>
    </View>
  )
}

const SettingsScreen: React.FC = () => {
  const accounts = useGameAccounts()
  const chesscomAccount = accounts.data?.find((account) => account.source === 'chesscom')

  return (
    <View style={styles.container} testID="settingsScreen">
      <Text style={styles.heading}>Game imports</Text>
      {accounts.isPending ? (
        <ActivityIndicator />
      ) : accounts.error ? (
        <Text style={styles.error}>{accounts.error.message}</Text>
      ) : chesscomAccount ? (
        <LinkedAccountCard account={chesscomAccount} />
      ) : (
        <LinkChessComForm />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16, width: '100%', maxWidth: 480, alignSelf: 'center' },
  heading: { fontSize: 22, fontWeight: '700' },
  card: { borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 16, gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardSub: { fontSize: 14, color: '#6E675D' },
  username: { fontSize: 18, fontWeight: '700' },
  stat: { fontSize: 15 },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  syncText: { fontSize: 14, color: '#6E675D' },
  syncedText: { fontSize: 14, color: '#6E675D' },
  actionsRow: { flexDirection: 'row', gap: 12, marginTop: 4 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 12, fontSize: 16 },
  button: { backgroundColor: '#1f6feb', padding: 14, borderRadius: 6, alignItems: 'center' },
  buttonText: { color: 'white', fontSize: 16, fontWeight: '600' },
  secondaryButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#1f6feb', flex: 1 },
  secondaryButtonText: { color: '#1f6feb', fontSize: 15, fontWeight: '600' },
  dangerButton: { backgroundColor: 'transparent', borderWidth: 1, borderColor: '#c0392b', flex: 1 },
  dangerButtonText: { color: '#c0392b', fontSize: 15, fontWeight: '600' },
  error: { color: 'red' },
})

export default SettingsScreen
