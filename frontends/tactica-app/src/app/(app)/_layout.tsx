import { Redirect, Stack } from 'expo-router'
import React from 'react'
import { ActivityIndicator, View } from 'react-native'
import { useAuth } from '../../auth/AuthContext'
import { TacticaWordmark } from '../../branding/TacticaWordmark'

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
  return <Stack screenOptions={{ title: 'Tactica', headerTitle: () => <TacticaWordmark /> }} />
}

export default AppLayout
