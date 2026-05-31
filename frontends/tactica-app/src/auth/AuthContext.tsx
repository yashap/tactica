import { useQueryClient } from '@tanstack/react-query'
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import * as authApi from './authApi'
import { setAuthLostHandler } from './authEvents'
import { tokenStorage } from './tokenStorage'

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
  const queryClient = useQueryClient()

  // Flip to logged-out and wipe any cached per-user data. Used by both `signOut` (intentional)
  // and the axios refresh-failure path (unrecoverable 401 mid-session). The token-storage
  // clear is fire-and-forget — UI doesn't need to wait, and the next successful auth call will
  // overwrite anyway.
  const clearSessionLocally = useCallback((): void => {
    void tokenStorage.clear()
    queryClient.clear()
    setState({ status: 'logged-out' })
  }, [queryClient])

  useEffect(() => {
    let cancelled = false

    // Register the side-channel from axios → React state. Any 401 the refresh interceptor can't
    // recover from will end up calling this and bouncing the user to /logIn via (app)/_layout.
    setAuthLostHandler(() => {
      if (!cancelled) clearSessionLocally()
    })

    void (async () => {
      const next = await checkSession()
      if (!cancelled) setState(next)
    })()

    return () => {
      cancelled = true
      setAuthLostHandler(null)
    }
  }, [clearSessionLocally])

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
    // The user's intent is clear — clear local state regardless of whether the server-side
    // signout actually succeeded (it may fail due to a dead server, an already-invalidated
    // session, etc.). Worst case the cookies linger until they expire or get overwritten by the
    // next signin.
    try {
      await authApi.signOut()
    } catch (error) {
      console.warn('Server signout failed; clearing local session anyway', error)
    }
    clearSessionLocally()
  }, [clearSessionLocally])

  const value = useMemo<AuthContextValue>(() => ({ state, signIn, signUp, signOut }), [state, signIn, signUp, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
