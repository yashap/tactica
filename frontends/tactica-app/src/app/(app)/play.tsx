import { router } from 'expo-router'
import React from 'react'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Chessboard } from '../../chess/Chessboard'
import { useAuth } from '../../auth/AuthContext'

const PlayScreen: React.FC = () => {
  const { signOut } = useAuth()

  const onLogOut = async (): Promise<void> => {
    await signOut()
    router.replace('/logIn')
  }

  return (
    <View style={styles.container} testID="playScreen">
      <View style={styles.header}>
        <Text style={styles.title}>Play</Text>
        <Pressable testID="logOutButton" onPress={() => void onLogOut()} style={styles.logOutButton}>
          <Text style={styles.logOutText}>Log out</Text>
        </Pressable>
      </View>
      <Chessboard />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 12 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 24, fontWeight: '600' },
  logOutButton: { padding: 8 },
  logOutText: { color: '#1f6feb' },
})

export default PlayScreen
