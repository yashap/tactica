import { Redirect } from 'expo-router'
import React from 'react'
import { ActivityIndicator, View } from 'react-native'
import { useAuth } from '../auth/AuthContext'

const Index: React.FC = () => {
  const { state } = useAuth()
  if (state.status === 'initializing') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator />
      </View>
    )
  }
  if (state.status === 'logged-in') return <Redirect href="/todos" />
  return <Redirect href="/logIn" />
}

export default Index
