// Route guards. ProtectedRoute gates the authed app (redirects to /login when
// unauthenticated). PublicOnlyRoute keeps an already-authed user out of the auth
// pages (sends them to the briefing at /app — "/" is the public marketing
// landing). Both wait for AuthContext.ready so we never flash the wrong screen
// during the initial /auth/me rehydrate. BootSplash is exported for App.jsx's
// RootRoute (navy splash → navy hero, no white flash).
import { Navigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../../context/AuthContext.jsx'

export function BootSplash() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-deep bg-navy-radial">
      <motion.div
        className="h-10 w-10 rounded-full border-4 border-gold/30 border-t-gold"
        animate={{ rotate: 360 }}
        transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
      />
    </div>
  )
}

export function ProtectedRoute({ children }) {
  const { isAuthenticated, ready } = useAuth()
  const location = useLocation()
  if (!ready) return <BootSplash />
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  return children
}

export function PublicOnlyRoute({ children }) {
  const { isAuthenticated, ready } = useAuth()
  if (!ready) return <BootSplash />
  if (isAuthenticated) return <Navigate to="/app" replace />
  return children
}

// Super-admin gate for the /admin platform console. Waits for the auth rehydrate
// (never flashes), bounces logged-out visitors to /login, and forwards a
// signed-in NON-admin to /app (never a blank crash). `isAdmin` is merged onto the
// user object from /auth/me by AuthContext; the server-side AdminGuard is the
// real, load-bearing gate — this is only UX routing.
export function AdminRoute({ children }) {
  const { isAuthenticated, ready, user } = useAuth()
  const location = useLocation()
  if (!ready) return <BootSplash />
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }
  if (!user?.isAdmin) return <Navigate to="/app" replace />
  return children
}

// Super-admin-ONLY sub-gate for the /admin/admins management screen. Nested INSIDE
// AdminRoute (so auth + ready are already settled by the time this renders), it
// forwards a regular db/env admin — who can use the console but must not manage
// admins — back to the console overview. The server SuperadminGuard is the real,
// load-bearing gate; this is only UX routing (never a blank crash).
export function AdminsRoute({ children }) {
  const { user } = useAuth()
  if (!user?.isSuperadmin) return <Navigate to="/admin/overview" replace />
  return children
}
