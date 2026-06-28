import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CheckCircle2 } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { apiErrorMessage } from '../lib/api.js'
import AuthLayout from '../components/auth/AuthLayout.jsx'
import { TextField, PasswordField, FormError } from '../components/auth/fields.jsx'
import PasswordRequirements, { allRequirementsMet } from '../components/auth/PasswordRequirements.jsx'
import { sanitizeInteger } from '../lib/numericInput.js'

export default function ResetPasswordPage() {
  const { resetPassword } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [email, setEmail] = useState(params.get('email') || '')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const pwOk = allRequirementsMet(password)
  const matches = confirm.length > 0 && confirm === password
  const canSubmit = email && code && pwOk && matches && !busy

  const submit = async () => {
    if (!canSubmit) return
    setError('')
    setBusy(true)
    try {
      await resetPassword({
        email: email.trim().toLowerCase(),
        reset_code: code.trim(),
        new_password: password,
      })
      setDone(true)
    } catch (err) {
      setError(apiErrorMessage(err, 'Invalid or expired reset code.'))
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <AuthLayout title="Password updated">
        <div className="flex flex-col items-center text-center">
          <CheckCircle2 className="mb-4 h-16 w-16 text-emerald-600" />
          <p className="text-[16px] text-ink">You can now sign in with your new password.</p>
          <button onClick={() => navigate('/login')} className="btn-primary mt-6">
            Continue to sign in
          </button>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Set a new password" subtitle="Enter the code from your email and choose a new password.">
      <TextField
        label="Email"
        type="email"
        value={email}
        placeholder="you@school.org"
        onChange={(e) => setEmail(e.target.value)}
      />
      <TextField
        label="Reset code"
        inputMode="numeric"
        value={code}
        placeholder="6-digit code"
        onChange={(e) => setCode(sanitizeInteger(e.target.value))}
      />
      <div className="mb-1">
        <PasswordField
          label="New password"
          value={password}
          autoComplete="new-password"
          placeholder="Create a strong password"
          onChange={(e) => setPassword(e.target.value)}
        />
        <PasswordRequirements password={password} />
      </div>
      <div className="mt-5">
        <PasswordField
          label="Confirm new password"
          value={confirm}
          autoComplete="new-password"
          placeholder="Re-enter your password"
          onChange={(e) => setConfirm(e.target.value)}
          onEnter={submit}
        />
        {confirm.length > 0 && !matches && (
          <p className="-mt-3 mb-2 text-[14px] text-danger">Passwords do not match.</p>
        )}
      </div>

      <FormError>{error}</FormError>

      <motion.button
        whileTap={{ scale: canSubmit ? 0.98 : 1 }}
        onClick={submit}
        disabled={!canSubmit}
        className="btn-primary mt-3 w-full disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? 'Updating…' : 'Reset password'}
      </motion.button>

      <div className="mt-6 text-center text-[15px] text-muted">
        <Link to="/login" className="font-semibold text-gold hover:underline">
          Back to sign in
        </Link>
      </div>
    </AuthLayout>
  )
}
