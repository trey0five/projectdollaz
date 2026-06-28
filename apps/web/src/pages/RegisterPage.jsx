import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MailCheck } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { apiErrorMessage } from '../lib/api.js'
import AuthLayout from '../components/auth/AuthLayout.jsx'
import { TextField, PasswordField, FormError } from '../components/auth/fields.jsx'
import PasswordRequirements, { allRequirementsMet } from '../components/auth/PasswordRequirements.jsx'

export default function RegisterPage() {
  const { register, resendVerification } = useAuth()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [resent, setResent] = useState(false)

  const pwOk = allRequirementsMet(password)
  const matches = confirm.length > 0 && confirm === password
  const canSubmit = firstName && lastName && email && pwOk && matches && !busy

  const submit = async () => {
    if (!canSubmit) return
    setError('')
    setBusy(true)
    try {
      await register({
        email: email.trim().toLowerCase(),
        password,
        first_name: firstName.trim(),
        last_name: lastName.trim(),
      })
      setDone(true)
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create your account.'))
    } finally {
      setBusy(false)
    }
  }

  const resend = async () => {
    try {
      await resendVerification(email.trim().toLowerCase())
      setResent(true)
    } catch {
      setResent(true) // generic response anyway
    }
  }

  if (done) {
    return (
      <AuthLayout title="Check your email" width={460}>
        <div className="flex flex-col items-center text-center">
          <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gold/15 text-gold">
            <MailCheck size={30} />
          </span>
          <p className="text-[16px] leading-relaxed text-ink">
            We sent a verification link to <strong>{email}</strong>. Click it to activate your
            account, then sign in.
          </p>
          <button
            onClick={resend}
            disabled={resent}
            className="mt-6 text-[15px] font-semibold text-gold hover:underline disabled:text-muted"
          >
            {resent ? 'Verification email re-sent' : "Didn't get it? Resend"}
          </button>
          <div className="mt-6 text-[15px] text-muted">
            <Link to="/login" className="font-semibold text-gold hover:underline">
              Back to sign in
            </Link>
          </div>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Create your account" subtitle="Start building financial statements in minutes." width={500}>
      <div className="grid grid-cols-2 gap-4">
        <TextField
          label="First name"
          value={firstName}
          autoComplete="given-name"
          onChange={(e) => setFirstName(e.target.value)}
        />
        <TextField
          label="Last name"
          value={lastName}
          autoComplete="family-name"
          onChange={(e) => setLastName(e.target.value)}
        />
      </div>
      <TextField
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        placeholder="you@school.org"
        onChange={(e) => setEmail(e.target.value)}
      />
      <div className="mb-1">
        <PasswordField
          label="Password"
          value={password}
          autoComplete="new-password"
          placeholder="Create a strong password"
          onChange={(e) => setPassword(e.target.value)}
        />
        <PasswordRequirements password={password} />
      </div>
      <div className="mt-5">
        <PasswordField
          label="Confirm password"
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
        {busy ? 'Creating account…' : 'Create Account'}
      </motion.button>

      <div className="mt-6 text-center text-[15px] text-muted">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-gold hover:underline">
          Sign in
        </Link>
      </div>
    </AuthLayout>
  )
}
