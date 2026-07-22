// ─────────────────────────────────────────────────────────────────────────────
// AuthContext — holds the authenticated user + token lifecycle. Tokens live in
// localStorage (managed by lib/api.js tokenStore); this context owns the user
// object and exposes login/register/logout/refresh/me + the password-reset flows.
//
// On mount, if an access token is present we call /auth/me to rehydrate the user
// (with `ready` gating the router so we never flash /login for a logged-in user).
// We also listen for the 'auth:logout' event the api client fires when a refresh
// hard-fails, clearing the user so ProtectedRoute bounces to /login.
// ─────────────────────────────────────────────────────────────────────────────
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { authApi, tokenStore } from '../lib/api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)
  const mounted = useRef(true)

  // Rehydrate on first load.
  useEffect(() => {
    mounted.current = true
    async function boot() {
      if (!tokenStore.getAccess()) {
        setReady(true)
        return
      }
      try {
        const res = await authApi.me()
        if (mounted.current) setUser(res.data.user)
      } catch {
        tokenStore.clear()
        if (mounted.current) setUser(null)
      } finally {
        if (mounted.current) setReady(true)
      }
    }
    boot()
    return () => {
      mounted.current = false
    }
  }, [])

  // The api client fires this when a refresh hard-fails (session truly gone).
  useEffect(() => {
    const onLogout = () => setUser(null)
    window.addEventListener('auth:logout', onLogout)
    return () => window.removeEventListener('auth:logout', onLogout)
  }, [])

  const login = useCallback(async (email, password) => {
    const res = await authApi.login({ email, password })
    // MFA branch: password was correct but a second factor is required. The
    // server sent NO tokens and NO user — we are NOT authenticated yet, so this
    // is a pure return (zero setState). The mfa_token lives only in the caller's
    // component state (never localStorage) and expires server-side in 5 minutes.
    if (res.data?.mfa_required) {
      return { mfaRequired: true, mfaToken: res.data.mfa_token }
    }
    const { access_token, refresh_token, user: u } = res.data
    tokenStore.set(access_token, refresh_token)
    setUser(u)
    return u
  }, [])

  // Second login step: exchange the challenge token + a TOTP/backup code for
  // real tokens. Mirrors login's token-store + setUser tail exactly.
  const loginMfa = useCallback(async (mfaToken, code) => {
    const res = await authApi.loginMfa({ mfa_token: mfaToken, code })
    const { access_token, refresh_token, user: u } = res.data
    tokenStore.set(access_token, refresh_token)
    setUser(u)
    return u
  }, [])

  const register = useCallback(async (data) => {
    // Returns { message, user } — does NOT log in (email must be verified first).
    const res = await authApi.register(data)
    return res.data
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } catch {
      // Best-effort; clear locally regardless.
    }
    tokenStore.clear()
    setUser(null)
  }, [])

  const refreshMe = useCallback(async () => {
    const res = await authApi.me()
    setUser(res.data.user)
    return res.data
  }, [])

  const value = {
    user,
    ready,
    isAuthenticated: !!user,
    login,
    loginMfa,
    register,
    logout,
    refreshMe,
    verifyEmail: (token) => authApi.verifyEmail(token),
    resendVerification: (email) => authApi.resendVerification(email),
    forgotPassword: (email) => authApi.forgotPassword(email),
    resetPassword: (data) => authApi.resetPassword(data),
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
