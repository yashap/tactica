import { Redirect, router, Stack } from 'expo-router'
import React from 'react'
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native'
import { useAuth } from '../../auth/AuthContext'
import { TacticaWordmark } from '../../branding/TacticaWordmark'

const LogOutButton: React.FC = () => {
  const { signOut } = useAuth()

  const onLogOut = async (): Promise<void> => {
    await signOut()
    router.replace('/logIn')
  }

  return (
    <Pressable testID="logOutButton" onPress={() => void onLogOut()} style={styles.logOutButton}>
      <Text style={styles.logOutText}>Log out</Text>
    </Pressable>
  )
}

const AppLayout: React.FC = () => {
  const { state } = useAuth()
  if (state.status === 'initializing') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    )
  }
  if (state.status === 'logged-out') return <Redirect href="/logIn" />
  return (
    <Stack
      screenOptions={{
        title: 'Tactica',
        headerTitle: () => <TacticaWordmark />,
        headerRight: () => <LogOutButton />,
      }}
    />
  )
}

const styles = StyleSheet.create({
  logOutButton: { padding: 8 },
  logOutText: { color: '#1f6feb' },
})

export default AppLayout
