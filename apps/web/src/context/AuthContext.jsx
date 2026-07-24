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
        // Merge the additive top-level `isAdmin` + `isSuperadmin` from /auth/me
        // onto the user so the /admin gate + the "Platform admin" menu link read
        // user.isAdmin, and the super-admin-only Admins section reads isSuperadmin.
        if (mounted.current)
          setUser({
            ...res.data.user,
            isAdmin: res.data.isAdmin,
            isSuperadmin: res.data.isSuperadmin,
          })
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
    // The login response carries no `isAdmin` (only /auth/me does). Enrich in the
    // background — non-blocking so login latency is unchanged — so a founder who
    // just logged in has user.isAdmin populated for the /admin gate + menu link.
    authApi
      .me()
      .then((r) => {
        if (mounted.current)
          setUser((prev) =>
            prev ? { ...prev, isAdmin: r.data.isAdmin, isSuperadmin: r.data.isSuperadmin } : prev,
          )
      })
      .catch(() => {})
    return u
  }, [])

  // Second login step: exchange the challenge token + a TOTP/backup code for
  // real tokens. Mirrors login's token-store + setUser tail exactly.
  const loginMfa = useCallback(async (mfaToken, code) => {
    const res = await authApi.loginMfa({ mfa_token: mfaToken, code })
    const { access_token, refresh_token, user: u } = res.data
    tokenStore.set(access_token, refresh_token)
    setUser(u)
    // Same background isAdmin enrichment as login() — the MFA response, like the
    // password response, carries no isAdmin (only /auth/me does).
    authApi
      .me()
      .then((r) => {
        if (mounted.current)
          setUser((prev) =>
            prev ? { ...prev, isAdmin: r.data.isAdmin, isSuperadmin: r.data.isSuperadmin } : prev,
          )
      })
      .catch(() => {})
    return u
  }, [])

  // Hidden super-admin console login (username-based). Mirrors login()'s token
  // store + setUser + isAdmin enrichment; a successful sign-in here is always an
  // admin, so the /admin gate opens immediately after refreshMe.
  const adminLogin = useCallback(async (username, password) => {
    const res = await authApi.adminLogin(username, password)
    const { access_token, refresh_token, user: u } = res.data
    tokenStore.set(access_token, refresh_token)
    // Confirm isAdmin BEFORE returning (the admin-login response carries no
    // isAdmin; only /auth/me does). Unlike the perf-sensitive user login this is
    // an admin-only path, so awaiting me() is fine — and it means the /admin gate
    // opens on the FIRST navigate instead of racing the async enrichment → /app.
    let isAdmin = false
    let isSuperadmin = false
    try {
      const r = await authApi.me()
      isAdmin = !!r.data?.isAdmin
      isSuperadmin = !!r.data?.isSuperadmin
    } catch {
      /* fall through with isAdmin=false */
    }
    const merged = { ...u, isAdmin, isSuperadmin }
    if (mounted.current) setUser(merged)
    return merged
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
    setUser({
      ...res.data.user,
      isAdmin: res.data.isAdmin,
      isSuperadmin: res.data.isSuperadmin,
    })
    return res.data
  }, [])

  const value = {
    user,
    ready,
    isAuthenticated: !!user,
    login,
    loginMfa,
    adminLogin,
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
