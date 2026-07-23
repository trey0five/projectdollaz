// ─────────────────────────────────────────────────────────────────────────────
// AdminLoginPage — the hidden super-admin console sign-in. Reached ONLY from the
// easter-egg entry on the public landing page (triple-click the word "hundred"),
// so there's no link to it anywhere. Username-based (the platform admin is keyed
// by a username, not an email) → posts to /auth/admin-login via adminLogin().
// A successful sign-in is always an admin, so we go straight to /admin.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ShieldCheck, Eye, EyeOff, Loader2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { apiErrorMessage } from '../../lib/api.js'

export default function AdminLoginPage() {
  const { adminLogin, user, ready } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Already an admin? Skip the form.
  useEffect(() => {
    if (ready && user?.isAdmin) navigate('/admin', { replace: true })
  }, [ready, user, navigate])

  const submit = async () => {
    if (busy || !username || !password) return
    setError('')
    setBusy(true)
    try {
      await adminLogin(username.trim(), password)
      navigate('/admin', { replace: true })
    } catch (err) {
      setError(apiErrorMessage(err, 'Invalid credentials.'))
      setBusy(false)
    }
  }

  const inputCls =
    'w-full rounded-xl border border-white/15 bg-white/[0.06] px-4 py-3 text-[15px] text-white ' +
    'placeholder-white/35 outline-none transition-all focus:border-[#3b82f6]/70 focus:bg-white/[0.09] focus:ring-4 focus:ring-[#3b82f6]/10'

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0a1229] px-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(680px 380px at 50% -10%, rgba(37,99,235,0.22), transparent 60%), radial-gradient(560px 400px at 90% 110%, rgba(139,92,246,0.14), transparent 60%)',
        }}
      />
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full max-w-[400px] overflow-hidden rounded-2xl border border-white/12 bg-white/[0.05] p-8 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
      >
        <span
          aria-hidden
          className="absolute inset-x-0 top-0 h-[3px]"
          style={{ background: 'linear-gradient(90deg,#2563EB,#7aa8ff 40%,#8b5cf6)' }}
        />
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-[#2563EB] to-[#3b82f6] text-white shadow-[0_10px_28px_rgba(37,99,235,0.4)]">
            <ShieldCheck size={26} />
          </span>
          <h1 className="font-serif text-[24px] font-semibold text-white">Platform Admin</h1>
          <p className="mt-1 text-[13px] text-white/50">Restricted — super-admin access only.</p>
        </div>

        <label className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.16em] text-white/55">
          Username
        </label>
        <input
          className={`${inputCls} mb-4`}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="username"
          autoFocus
        />

        <label className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.16em] text-white/55">
          Password
        </label>
        <div className="relative mb-5">
          <input
            className={`${inputCls} pr-12`}
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            autoComplete="current-password"
            placeholder="••••••••"
          />
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShow((s) => !s)}
            aria-label={show ? 'Hide password' : 'Show password'}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-white/45 transition-colors hover:text-white/80"
          >
            {show ? <EyeOff size={18} /> : <Eye size={18} />}
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-400/30 bg-red-500/15 px-3 py-2 text-center text-[14px] text-red-200">
            {error}
          </div>
        )}

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={submit}
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#3b82f6] px-5 py-3.5 text-[14px] font-bold uppercase tracking-[0.12em] text-white shadow-[0_10px_28px_-8px_rgba(37,99,235,0.6)] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Signing in…
            </>
          ) : (
            'Enter console'
          )}
        </motion.button>
      </motion.div>
    </div>
  )
}
