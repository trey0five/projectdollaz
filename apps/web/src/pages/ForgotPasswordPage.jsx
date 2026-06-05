import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext.jsx'
import AuthLayout from '../components/auth/AuthLayout.jsx'
import { TextField, FormSuccess } from '../components/auth/fields.jsx'

export default function ForgotPasswordPage() {
  const { forgotPassword } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!email || busy) return
    setBusy(true)
    try {
      await forgotPassword(email.trim().toLowerCase())
    } catch {
      // Generic response regardless (anti-enumeration).
    }
    setBusy(false)
    setSent(true)
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll email you a 6-digit code to set a new password."
    >
      <TextField
        label="Email"
        type="email"
        value={email}
        placeholder="you@school.org"
        onChange={(e) => setEmail(e.target.value)}
      />
      {sent && (
        <FormSuccess>If that account exists, a reset code was sent. Check your email.</FormSuccess>
      )}
      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={submit}
        disabled={busy}
        className="btn-primary mt-3 w-full disabled:opacity-60"
      >
        {busy ? 'Sending…' : 'Send reset code'}
      </motion.button>
      {sent && (
        <button
          onClick={() => navigate(`/reset-password?email=${encodeURIComponent(email.trim().toLowerCase())}`)}
          className="mt-3 w-full text-center text-[13px] font-semibold text-gold hover:underline"
        >
          I have a code — continue
        </button>
      )}
      <div className="mt-6 text-center text-[13px] text-muted">
        <Link to="/login" className="font-semibold text-gold hover:underline">
          Back to sign in
        </Link>
      </div>
    </AuthLayout>
  )
}
