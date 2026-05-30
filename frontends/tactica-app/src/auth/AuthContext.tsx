import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as authApi from './authApi'

export interface AuthState {
  status: 'initializing' | 'logged-out' | 'logged-in'
  userId?: string
}

export interface AuthContextValue {
  state: AuthState
  signIn: (email: string, password: string) => Promise<authApi.AuthApiResult>
  signUp: (email: string, password: string) => Promise<authApi.AuthApiResult>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

export const useAuth = (): AuthContextValue => {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

const checkSession = async (): Promise<AuthState> => {
  const session = await authApi.fetchSession()
  if (!session) return { status: 'logged-out' }
  return { status: 'logged-in', userId: session.userId }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({ status: 'initializing' })

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const next = await checkSession()
      if (!cancelled) setState(next)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const result = await authApi.signIn(email, password)
    if (result.status === 'OK') {
      const next = await checkSession()
      setState(next)
    }
    return result
  }, [])

  const signUp = useCallback(async (email: string, password: string) => {
    const result = await authApi.signUp(email, password)
    if (result.status === 'OK') {
      const next = await checkSession()
      setState(next)
    }
    return result
  }, [])

  const signOut = useCallback(async () => {
    await authApi.signOut()
    setState({ status: 'logged-out' })
  }, [])

  const value = useMemo<AuthContextValue>(() => ({ state, signIn, signUp, signOut }), [state, signIn, signUp, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
