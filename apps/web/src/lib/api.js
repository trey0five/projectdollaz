// ─────────────────────────────────────────────────────────────────────────────
// Axios API client with token storage + PROACTIVE refresh (ported from smartbot's
// interceptor idea, adapted to finrep's JSON-body /auth/refresh contract).
//
// - Access + refresh tokens live in localStorage (keys ACCESS_KEY / REFRESH_KEY).
// - Request interceptor attaches the Bearer access token and, if it expires
//   within REFRESH_SKEW_MS, proactively rotates it first (deduped via a single
//   in-flight promise) so normal use never hits a hard 401.
// - Response interceptor does a one-shot 401 retry through /auth/refresh.
// - On a failed refresh we clear tokens and dispatch an 'auth:logout' event the
//   AuthContext listens for (it owns the actual redirect, so the client stays
//   router-agnostic).
// ─────────────────────────────────────────────────────────────────────────────
import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

export const ACCESS_KEY = 'finrep_access_token'
export const REFRESH_KEY = 'finrep_refresh_token'

// Refresh this long before the access token actually expires.
const REFRESH_SKEW_MS = 2 * 60 * 1000

export const tokenStore = {
  getAccess: () => localStorage.getItem(ACCESS_KEY),
  getRefresh: () => localStorage.getItem(REFRESH_KEY),
  set(access, refresh) {
    if (access) localStorage.setItem(ACCESS_KEY, access)
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh)
  },
  setAccess(access) {
    if (access) localStorage.setItem(ACCESS_KEY, access)
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  headers: { 'Content-Type': 'application/json' },
})

// Decode a JWT's `exp` (ms) without a library. Returns null on any malformed token.
function getTokenExpiry(token) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(part))
    return payload.exp ? payload.exp * 1000 : null
  } catch {
    return null
  }
}

// Single in-flight refresh shared by every caller (dedupe stampede).
let refreshPromise = null

function notifyLoggedOut() {
  tokenStore.clear()
  window.dispatchEvent(new CustomEvent('auth:logout'))
}

// Rotate the refresh token via the API. Persists BOTH new tokens (the backend
// rotates the refresh token on every /auth/refresh) and returns the access one.
async function doRefresh() {
  const refresh = tokenStore.getRefresh()
  if (!refresh) return null
  try {
    const res = await axios.post(`${API_BASE_URL}/auth/refresh`, {
      refresh_token: refresh,
    })
    const { access_token, refresh_token } = res.data
    tokenStore.set(access_token, refresh_token)
    return access_token
  } catch {
    notifyLoggedOut()
    return null
  } finally {
    refreshPromise = null
  }
}

function refreshOnce() {
  if (!refreshPromise) refreshPromise = doRefresh()
  return refreshPromise
}

const isAuthEndpoint = (url = '') =>
  url.includes('/auth/login') ||
  url.includes('/auth/register') ||
  url.includes('/auth/refresh') ||
  url.includes('/auth/verify-email') ||
  url.includes('/auth/resend-verification') ||
  url.includes('/auth/forgot-password') ||
  url.includes('/auth/reset-password')

// Request: attach Bearer + proactive refresh shortly before expiry.
api.interceptors.request.use(async (config) => {
  if (isAuthEndpoint(config.url)) return config
  let token = tokenStore.getAccess()
  if (token) {
    const exp = getTokenExpiry(token)
    if (exp && exp - Date.now() < REFRESH_SKEW_MS) {
      const fresh = await refreshOnce()
      if (fresh) token = fresh
    }
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// Response: one-shot 401 retry through refresh.
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config || {}
    if (error.response?.status === 401 && !isAuthEndpoint(original.url) && !original._retry) {
      const fresh = await refreshOnce()
      if (fresh) {
        original._retry = true
        original.headers = original.headers || {}
        original.headers.Authorization = `Bearer ${fresh}`
        return api.request(original)
      }
      notifyLoggedOut()
    }
    return Promise.reject(error)
  },
)

// Pull a friendly message out of a Nest error response.
export function apiErrorMessage(err, fallback = 'Something went wrong. Please try again.') {
  const data = err?.response?.data
  if (!data) return err?.message || fallback
  if (typeof data.message === 'string') return data.message
  if (Array.isArray(data.message)) return data.message.join(' ')
  if (typeof data === 'string') return data
  return fallback
}

// The backend signals an unverified-email login with a 403 + code.
export function isEmailNotVerified(err) {
  return err?.response?.data?.code === 'EMAIL_NOT_VERIFIED'
}

// ── Typed-ish endpoint wrappers ──────────────────────────────────────────────
export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  logout: () => api.post('/auth/logout'),
  me: () => api.get('/auth/me'),
  verifyEmail: (token) => api.post('/auth/verify-email', { token }),
  resendVerification: (email) => api.post('/auth/resend-verification', { email }),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }),
  resetPassword: (data) => api.post('/auth/reset-password', data),
  refresh: (refresh_token) => api.post('/auth/refresh', { refresh_token }),
}

export const schoolsApi = {
  list: () => api.get('/schools'),
  create: (data) => api.post('/schools', data),
  members: (schoolId) => api.get(`/schools/${schoolId}/members`),
  invite: (schoolId, data) => api.post(`/schools/${schoolId}/invitations`, data),
  acceptInvite: (token) => api.post('/invitations/accept', { token }),
}
