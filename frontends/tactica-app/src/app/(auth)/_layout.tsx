import { Redirect, Stack } from 'expo-router'
import React from 'react'
import { useAuth } from '../../auth/AuthContext'
import { TacticaWordmark } from '../../branding/TacticaWordmark'

const AuthLayout: React.FC = () => {
  const { state } = useAuth()
  if (state.status === 'logged-in') return <Redirect href="/play" />
  return <Stack screenOptions={{ title: 'Tactica', headerTitle: () => <TacticaWordmark /> }} />
}

export default AuthLayout
