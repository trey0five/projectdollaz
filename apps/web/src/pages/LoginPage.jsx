import { useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext.jsx'
import { apiErrorMessage, isEmailNotVerified } from '../lib/api.js'
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
