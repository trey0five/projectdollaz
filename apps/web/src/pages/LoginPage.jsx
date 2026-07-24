// Login (two-step aware): step 1 is the classic credentials card — its DOM is
// unchanged so existing e2e recipes (fill email → fill password → Enter) keep
// passing. When the server answers { mfa_required, mfa_token } (TOTP users),
// step 2 cross-fades into the SAME AuthLayout card: a 6-digit code input
// (auto-submits at 6 digits) with a "use a recovery code instead" toggle.
// The mfa_token lives ONLY in component state — never localStorage.
import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, ShieldCheck, ArrowLeft } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { apiErrorCode, apiErrorMessage, isEmailNotVerified } from '../lib/api.js'
import { captureInviteFromUrl, getPendingInvite } from '../lib/pendingInvite.js'
import AuthLayout from '../components/auth/AuthLayout.jsx'
import {
  GlassTextField,
  GlassPasswordField,
  GlassFormError,
  glassInput,
} from '../components/auth/glassFields.jsx'

const codeInputCls = `${glassInput} text-center font-mono text-[24px] tracking-[0.4em]`
const backupInputCls = `${glassInput} text-center font-mono text-[19px] tracking-[0.14em]`

export default function LoginPage() {
  const { login, loginMfa } = useAuth()
  const navigate = useNavigate()
  // Hidden entry to the super-admin console: triple-click the word "workspace"
  // in the subtitle (clicks within ~1.2s). No visible affordance.
  const wsClicks = useRef({ n: 0, t: 0 })
  const onWorkspaceClick = () => {
    const now = Date.now()
    const c = wsClicks.current
    c.n = now - c.t < 1200 ? c.n + 1 : 1
    c.t = now
    if (c.n >= 3) {
      c.n = 0
      navigate('/admin/login')
    }
  }
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [needsVerify, setNeedsVerify] = useState(false)
  const [busy, setBusy] = useState(false)
  // ── MFA step-2 state (memory only — the challenge token never persists) ─────
  const [mfaToken, setMfaToken] = useState(null)
  const [code, setCode] = useState('')
  const [useBackup, setUseBackup] = useState(false)
  const codeRef = useRef(null)
  // Stash an emailed invite token so it survives the (possible) register→verify
  // detour and is redeemed once authenticated (SchoolContext.loadSchools). The
  // effect only writes localStorage (no setState); the banner reads in render.
  useEffect(() => {
    captureInviteFromUrl(location.search)
  }, [location.search])
  const hasInvite =
    !!new URLSearchParams(location.search || '').get('invite') || !!getPendingInvite()

  const dest =
    location.state?.from && location.state.from !== '/login' ? location.state.from : '/app'

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
      const result = await login(email.trim().toLowerCase(), password)
      if (result?.mfaRequired) {
        // Password OK, second factor pending — swap to the code step.
        setMfaToken(result.mfaToken)
        setCode('')
        setUseBackup(false)
        return
      }
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

  const submitCode = async (value) => {
    const attempt = (value ?? code).trim()
    if (busy || !attempt) return
    setError('')
    setBusy(true)
    try {
      await loginMfa(mfaToken, attempt)
      navigate(dest, { replace: true })
    } catch (err) {
      const status = err?.response?.status
      const msg = apiErrorMessage(err, 'Invalid code.')
      // Discriminate the two 401 classes on the structured `code` field
      // (MFA_CHALLENGE_INVALID vs MFA_CODE_INVALID); the message-regex stays
      // only as a fallback for older API builds without the code field.
      const errCode = apiErrorCode(err)
      const challengeDead =
        status === 401 &&
        (errCode ? errCode === 'MFA_CHALLENGE_INVALID' : !/invalid code/i.test(msg))
      if (challengeDead) {
        // Challenge-class failure (expired / consumed / too many attempts):
        // the sign-in session is dead — bounce back to step 1.
        setMfaToken(null)
        setPassword('')
        setCode('')
        setError(msg)
      } else {
        setError(msg)
        setCode('')
        codeRef.current?.focus()
      }
    } finally {
      setBusy(false)
    }
  }

  const onCodeChange = (e) => {
    if (useBackup) {
      // Backup codes: the server alphabet is [A-Z2-9] (no 0/1 — RESET_ALPHABET
      // omits ambiguous chars), plus optional dashes/spaces (server strips).
      const v = e.target.value.toUpperCase().replace(/[^A-Z2-9\s-]/g, '').slice(0, 14)
      setCode(v)
      return
    }
    const digits = e.target.value.replace(/\D/g, '').slice(0, 6)
    setCode(digits)
    // Auto-submit the moment the 6th digit lands.
    if (digits.length === 6) submitCode(digits)
  }

  const backToSignIn = () => {
    setMfaToken(null)
    setCode('')
    setUseBackup(false)
    setError('')
  }

  // Codes are exactly 10 chars once separators are stripped — don't let a
  // near-miss reach the API (it would surface the raw DTO regex message).
  const backupReady = code.replace(/[\s-]/g, '').length === 10
  const step = mfaToken ? 'code' : 'credentials'

  return (
    <AuthLayout
      title={step === 'code' ? 'Two-step verification' : 'Welcome back'}
      subtitle={
        step === 'code'
          ? useBackup
            ? 'Enter one of your saved recovery codes.'
            : 'Enter the 6-digit code from your authenticator app.'
          : (
            <>
              Sign in to your financial reporting{' '}
              <span onClick={onWorkspaceClick} className="cursor-default select-none">
                workspace
              </span>
              .
            </>
          )
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {step === 'credentials' ? (
          <motion.div
            key="credentials"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {hasInvite && (
              <div className="mb-5 flex items-start gap-2.5 rounded-xl border border-gold/40 bg-gold/15 px-4 py-3 text-[14px] leading-relaxed text-white/90">
                <Mail size={16} className="mt-0.5 shrink-0 text-gold" />
                <span>
                  You&rsquo;ve been invited to a school. Sign in — or{' '}
                  <Link to="/register" className="font-semibold text-gold-light hover:underline">
                    create an account
                  </Link>{' '}
                  — with <strong>the email the invite was sent to</strong>, and you&rsquo;ll join
                  automatically.
                </span>
              </div>
            )}
            <GlassTextField
              label="Email"
              type="email"
              autoComplete="email"
              value={email}
              placeholder="you@school.org"
              onChange={(e) => setEmail(e.target.value)}
            />
            <GlassPasswordField
              label="Password"
              value={password}
              autoComplete="current-password"
              placeholder="Your password"
              onChange={(e) => setPassword(e.target.value)}
              onEnter={submit}
            />

            <div className="mb-4 text-right">
              <Link
                to="/forgot-password"
                className="text-[15px] font-semibold text-gold-light hover:underline"
              >
                Forgot password?
              </Link>
            </div>

            <GlassFormError>{error}</GlassFormError>
            {needsVerify && (
              <div className="mt-1 text-center text-[15px]">
                <Link to="/verify-email" className="font-semibold text-gold-light hover:underline">
                  Resend verification email
                </Link>
              </div>
            )}

            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={submit}
              disabled={busy}
              className="btn-gold mt-3 w-full py-3.5 text-[14px] disabled:opacity-60"
            >
              {busy ? 'Signing in…' : 'Sign In'}
            </motion.button>

            <div className="mt-6 text-center text-[15px] text-white/60">
              No account?{' '}
              <Link to="/register" className="font-semibold text-gold-light hover:underline">
                Create one
              </Link>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="code"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="mb-6 flex justify-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold/15 text-gold">
                <ShieldCheck size={28} strokeWidth={2} />
              </span>
            </div>

            <div className="mb-5">
              <label className="mb-2 block text-center text-[13px] font-semibold uppercase tracking-[0.16em] text-white/55">
                {useBackup ? 'Recovery code' : 'Verification code'}
              </label>
              <input
                ref={codeRef}
                key={useBackup ? 'backup' : 'totp'}
                value={code}
                onChange={onCodeChange}
                onKeyDown={(e) =>
                  e.key === 'Enter' &&
                  (useBackup ? backupReady : code.length === 6) &&
                  submitCode()
                }
                inputMode={useBackup ? 'text' : 'numeric'}
                autoComplete="one-time-code"
                autoFocus
                spellCheck={false}
                placeholder={useBackup ? 'XXXXX-XXXXX' : '••••••'}
                aria-label={useBackup ? 'Recovery code' : '6-digit verification code'}
                className={useBackup ? backupInputCls : codeInputCls}
              />
            </div>

            <GlassFormError>{error}</GlassFormError>

            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={() => submitCode()}
              disabled={busy || (useBackup ? !backupReady : code.length !== 6)}
              className="btn-gold mt-3 w-full py-3.5 text-[14px] disabled:opacity-60"
            >
              {busy ? 'Verifying…' : 'Verify'}
            </motion.button>

            <div className="mt-5 text-center">
              <button
                type="button"
                onClick={() => {
                  setUseBackup((b) => !b)
                  setCode('')
                  setError('')
                }}
                className="text-[15px] font-semibold text-gold-light hover:underline"
              >
                {useBackup ? 'Use your authenticator app instead' : 'Use a recovery code instead'}
              </button>
            </div>

            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={backToSignIn}
                className="inline-flex items-center gap-1.5 text-[15px] font-medium text-white/55 transition-colors hover:text-white"
              >
                <ArrowLeft size={15} />
                Back to sign in
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthLayout>
  )
}
