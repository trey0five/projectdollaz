import { useState, useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, XCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { apiErrorMessage } from '../lib/api.js'
import AuthLayout from '../components/auth/AuthLayout.jsx'
import { GlassTextField, GlassFormError, GlassFormSuccess } from '../components/auth/glassFields.jsx'

export default function VerifyEmailPage() {
  const { verifyEmail, resendVerification } = useAuth()
  const [params] = useSearchParams()
  const token = params.get('token')
  // 'idle' (no token, show resend form) | 'verifying' | 'success' | 'error'
  const [state, setState] = useState(token ? 'verifying' : 'idle')
  const [message, setMessage] = useState('')
  const [email, setEmail] = useState('')
  const [resent, setResent] = useState('')
  const ran = useRef(false)

  useEffect(() => {
    if (!token || ran.current) return
    ran.current = true
    verifyEmail(token)
      .then((res) => {
        setState('success')
        setMessage(res.data?.message || 'Your email is verified.')
      })
      .catch((err) => {
        setState('error')
        setMessage(apiErrorMessage(err, 'This verification link is invalid or has expired.'))
      })
  }, [token, verifyEmail])

  const resend = async () => {
    setResent('')
    try {
      await resendVerification(email.trim().toLowerCase())
    } catch {
      // generic anyway
    }
    setResent('If that account exists and is unverified, a new link was sent.')
  }

  if (state === 'verifying') {
    return (
      <AuthLayout title="Verifying your email" subtitle="One moment…">
        <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full w-1/2 animate-pulse rounded-full bg-gold" />
        </div>
      </AuthLayout>
    )
  }

  if (state === 'success') {
    return (
      <AuthLayout title="Email verified">
        <div className="flex flex-col items-center text-center">
          <CheckCircle2 className="mb-4 h-16 w-16 text-emerald-300" />
          <p className="text-[16px] text-white/85">{message}</p>
          <Link to="/login" className="btn-gold mt-6 inline-block">
            Continue to sign in
          </Link>
        </div>
      </AuthLayout>
    )
  }

  // 'error' or 'idle' — show a resend-by-email form.
  return (
    <AuthLayout
      title={state === 'error' ? 'Verification failed' : 'Verify your email'}
      subtitle={
        state === 'error'
          ? undefined
          : 'Enter your email to receive a new verification link.'
      }
    >
      {state === 'error' && (
        <div className="mb-5 flex flex-col items-center text-center">
          <XCircle className="mb-3 h-12 w-12 text-red-300" />
          <p className="text-[16px] text-white/85">{message}</p>
        </div>
      )}
      <GlassTextField
        label="Email"
        type="email"
        value={email}
        placeholder="you@school.org"
        onChange={(e) => setEmail(e.target.value)}
      />
      <GlassFormError>{null}</GlassFormError>
      <GlassFormSuccess>{resent}</GlassFormSuccess>
      <button onClick={resend} disabled={!email} className="btn-gold mt-3 w-full py-3.5 text-[14px] disabled:opacity-50">
        Resend verification link
      </button>
      <div className="mt-6 text-center text-[15px] text-white/60">
        <Link to="/login" className="font-semibold text-gold-light hover:underline">
          Back to sign in
        </Link>
      </div>
    </AuthLayout>
  )
}
