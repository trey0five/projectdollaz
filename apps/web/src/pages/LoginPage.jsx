import { useEffect, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mail } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { apiErrorMessage, isEmailNotVerified } from '../lib/api.js'
import { captureInviteFromUrl, getPendingInvite } from '../lib/pendingInvite.js'
import AuthLayout from '../components/auth/AuthLayout.jsx'
import { TextField, PasswordField, FormError } from '../components/auth/fields.jsx'

export default function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [needsVerify, setNeedsVerify] = useState(false)
  const [busy, setBusy] = useState(false)
  // Stash an emailed invite token so it survives the (possible) register→verify
  // detour and is redeemed once authenticated (SchoolContext.loadSchools). The
  // effect only writes localStorage (no setState); the banner reads in render.
  useEffect(() => {
    captureInviteFromUrl(location.search)
  }, [location.search])
  const hasInvite =
    !!new URLSearchParams(location.search || '').get('invite') || !!getPendingInvite()

  const submit = async () => {
    if (busy) return
    setError('')
    setNeedsVerify(false)
    if (!email || !password) {
      setError('Please enter your email and password.')
      return
    }
    setBusy(true)
    try {
      await login(email.trim().toLowerCase(), password)
      const dest = location.state?.from && location.state.from !== '/login' ? location.state.from : '/'
      navigate(dest, { replace: true })
    } catch (err) {
      if (isEmailNotVerified(err)) {
        setNeedsVerify(true)
        setError('Please verify your email before logging in.')
      } else {
        setError(apiErrorMessage(err, 'Invalid email or password.'))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in to your financial reporting workspace.">
      {hasInvite && (
        <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3 text-[14px] leading-relaxed text-navy">
          <Mail size={16} className="mt-0.5 shrink-0 text-gold" />
          <span>
            You&rsquo;ve been invited to a school. Sign in — or{' '}
            <Link to="/register" className="font-semibold text-gold hover:underline">
              create an account
            </Link>{' '}
            — with <strong>the email the invite was sent to</strong>, and you&rsquo;ll join
            automatically.
          </span>
        </div>
      )}
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        placeholder="you@school.org"
        onChange={(e) => setEmail(e.target.value)}
      />
      <PasswordField
        label="Password"
        value={password}
        autoComplete="current-password"
        placeholder="Your password"
        onChange={(e) => setPassword(e.target.value)}
        onEnter={submit}
      />

      <div className="mb-4 text-right">
        <Link to="/forgot-password" className="text-[15px] font-semibold text-gold hover:underline">
          Forgot password?
        </Link>
      </div>

      <FormError>{error}</FormError>
      {needsVerify && (
        <div className="mt-1 text-center text-[15px]">
          <Link to="/verify-email" className="font-semibold text-gold hover:underline">
            Resend verification email
          </Link>
        </div>
      )}

      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={submit}
        disabled={busy}
        className="btn-primary mt-3 w-full disabled:opacity-60"
      >
        {busy ? 'Signing in…' : 'Sign In'}
      </motion.button>

      <div className="mt-6 text-center text-[15px] text-muted">
        No account?{' '}
        <Link to="/register" className="font-semibold text-gold hover:underline">
          Create one
        </Link>
      </div>
    </AuthLayout>
  )
}
