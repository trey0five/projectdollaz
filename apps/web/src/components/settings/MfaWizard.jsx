// ─────────────────────────────────────────────────────────────────────────────
// MfaWizard — the two-factor authentication lifecycle inside the ONE premium
// EntityFormModal surface. Three modes:
//   • enable     : password → QR (scan / copy the base32 secret) → 6-digit
//                  verify → the 10 backup codes, shown exactly ONCE (copy-all +
//                  download, "I've saved these" gates Done) + a gold beat.
//   • disable    : password + current code, danger-styled confirm.
//   • regenerate : password + current code → a fresh set of 10 backup codes
//                  (the old ones stop working immediately).
// The QR is rendered CLIENT-SIDE (qrcode → data URL) from the server's
// otpauth_uri, so the secret never touches a third-party chart service.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ShieldCheck, ShieldOff, KeyRound, Copy, Check, Download } from 'lucide-react'
import QRCode from 'qrcode'
import EntityFormModal, { Field, fieldInput } from '../ui/EntityFormModal.jsx'
import { useUiV2 } from '../../context/UiFlagContext.jsx'
import { authApi, apiErrorMessage, apiErrorCode } from '../../lib/api.js'

// Display shape only — the server strips dashes/spaces before verifying.
const prettyCode = (c) => (c.length === 10 ? `${c.slice(0, 5)}-${c.slice(5)}` : c)

function friendlyError(err, fallback) {
  const code = apiErrorCode(err)
  if (code === 'MFA_NOT_CONFIGURED')
    return 'Two-factor authentication is not available on this server yet.'
  if (code === 'MFA_ALREADY_ENABLED')
    return 'Two-factor authentication is already enabled. Turn it off first.'
  return apiErrorMessage(err, fallback)
}

/** Monospace grid of the 10 backup codes + copy-all / download affordances. */
function BackupCodesPanel({ codes, v2, onAllSaved, allSaved, celebrate }) {
  const reduce = useReducedMotion()
  const [copied, setCopied] = useState(false)
  const copyTimer = useRef(null)
  useEffect(() => () => clearTimeout(copyTimer.current), [])

  const copyAll = async () => {
    try {
      await navigator.clipboard.writeText(codes.map(prettyCode).join('\n'))
      setCopied(true)
      clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable — the download button still works */
    }
  }

  const download = () => {
    const body = [
      'KYRO two-factor recovery codes',
      `Generated ${new Date().toLocaleDateString()}`,
      '',
      'Each code works exactly once. Keep them somewhere safe.',
      '',
      ...codes.map(prettyCode),
      '',
    ].join('\n')
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain' }))
    const a = document.createElement('a')
    a.href = url
    a.download = 'kyro-recovery-codes.txt'
    a.click()
    URL.revokeObjectURL(url)
  }

  const sub = v2 ? 'text-muted' : 'text-white/60'
  return (
    <div className="sm:col-span-2">
      {celebrate && (
        <div className="mb-3 flex items-center gap-3">
          <span className="relative flex h-11 w-11 items-center justify-center rounded-full bg-gold/15 text-gold">
            {!reduce && (
              <motion.span
                aria-hidden="true"
                className="absolute inset-0 rounded-full border-2 border-gold/60"
                initial={{ scale: 1, opacity: 0.9 }}
                animate={{ scale: 1.8, opacity: 0 }}
                transition={{ duration: 1.1, ease: 'easeOut', repeat: 1 }}
              />
            )}
            <ShieldCheck size={22} />
          </span>
          <div>
            <p className={`text-[15px] font-semibold ${v2 ? 'text-navy' : 'text-white'}`}>
              Two-factor is on.
            </p>
            <p className={`text-[13px] ${sub}`}>One last thing — save your recovery codes.</p>
          </div>
        </div>
      )}
      <p className={`text-[13px] leading-snug ${sub}`}>
        These codes are shown <strong>once</strong>. Each one signs you in a single time if you
        lose your authenticator.
      </p>
      <div
        className={`mt-3 grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl border p-4 font-mono text-[14px] tracking-[0.08em] ${
          v2 ? 'border-rule bg-section text-navy' : 'border-white/15 bg-navy-deep/50 text-gold-light'
        }`}
      >
        {codes.map((c) => (
          <span key={c}>{prettyCode(c)}</span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copyAll}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
            v2
              ? 'border-rule text-navy hover:border-gold'
              : 'border-white/20 text-white/85 hover:border-gold/60'
          }`}
        >
          {copied ? <Check size={14} className="text-gold" /> : <Copy size={14} />}
          {copied ? 'Copied' : 'Copy all'}
        </button>
        <button
          type="button"
          onClick={download}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors ${
            v2
              ? 'border-rule text-navy hover:border-gold'
              : 'border-white/20 text-white/85 hover:border-gold/60'
          }`}
        >
          <Download size={14} />
          Download .txt
        </button>
      </div>
      <label className="mt-4 flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={allSaved}
          onChange={(e) => onAllSaved(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-[#C9A227]"
        />
        <span className={`text-[13.5px] leading-snug ${v2 ? 'text-navy' : 'text-white/85'}`}>
          I&rsquo;ve saved these codes somewhere safe.
        </span>
      </label>
    </div>
  )
}

export default function MfaWizard({ open, mode = 'enable', onClose, onChanged }) {
  const v2 = useUiV2()
  // enable: password → qr → verify → codes; disable/regenerate: confirm (→ codes)
  const [step, setStep] = useState('password')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [secret, setSecret] = useState('')
  const [qrDataUrl, setQrDataUrl] = useState('')
  const [backupCodes, setBackupCodes] = useState([])
  const [allSaved, setAllSaved] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [secretCopied, setSecretCopied] = useState(false)
  const doneRef = useRef(false)

  // Fresh state every time the wizard opens (and whenever the mode changes).
  useEffect(() => {
    if (!open) return
    setStep(mode === 'enable' ? 'password' : 'confirm')
    setPassword('')
    setCode('')
    setSecret('')
    setQrDataUrl('')
    setBackupCodes([])
    setAllSaved(false)
    setError('')
    setBusy(false)
    setSecretCopied(false)
    doneRef.current = false
  }, [open, mode])

  // Closing after a state-changing call (even via Esc/X on the codes step)
  // must still refresh the caller — the server-side state already changed.
  const handleClose = () => {
    if (doneRef.current) onChanged?.()
    onClose?.()
  }
  const finish = () => handleClose()

  const startSetup = async () => {
    const res = await authApi.mfaSetup({ password })
    const { secret: s, otpauth_uri } = res.data
    const dataUrl = await QRCode.toDataURL(otpauth_uri, { width: 220, margin: 1 })
    setSecret(s)
    setQrDataUrl(dataUrl)
    setStep('qr')
  }

  const verifyEnable = async () => {
    try {
      const res = await authApi.mfaEnable({ code })
      setBackupCodes(res.data.backup_codes || [])
      doneRef.current = true
      setStep('codes')
    } catch (err) {
      if (apiErrorCode(err) === 'MFA_SETUP_EXPIRED') {
        // Pending secret expired (15 min) — restart from the password step.
        setStep('password')
        setPassword('')
        setCode('')
        setQrDataUrl('')
        setSecret('')
        throw new Error('Setup expired — let’s start again from your password.')
      }
      throw err
    }
  }

  const confirmDisable = async () => {
    await authApi.mfaDisable({ password, code })
    doneRef.current = true
    finish()
  }

  const confirmRegenerate = async () => {
    const res = await authApi.mfaRegenerateBackupCodes({ password, code })
    setBackupCodes(res.data.backup_codes || [])
    doneRef.current = true
    setStep('codes')
  }

  const onSubmit = async (e) => {
    e.preventDefault()
    if (busy) return
    setError('')
    if (step === 'qr') {
      setStep('verify')
      return
    }
    if (step === 'codes') {
      if (!allSaved) {
        setError('Please confirm you saved your codes first.')
        return
      }
      finish()
      return
    }
    setBusy(true)
    try {
      if (step === 'password') await startSetup()
      else if (step === 'verify') await verifyEnable()
      else if (mode === 'disable') await confirmDisable()
      else await confirmRegenerate()
    } catch (err) {
      setError(err?.response ? friendlyError(err, 'Something went wrong.') : err.message)
    } finally {
      setBusy(false)
    }
  }

  const copySecret = async () => {
    try {
      await navigator.clipboard.writeText(secret)
      setSecretCopied(true)
      setTimeout(() => setSecretCopied(false), 2000)
    } catch {
      /* no-op */
    }
  }

  const headers = {
    enable: {
      icon: ShieldCheck,
      title: 'Turn on two-factor',
      subtitle: 'A 6-digit code from your phone, every sign-in.',
    },
    disable: {
      icon: ShieldOff,
      title: 'Turn off two-factor',
      subtitle: 'Your account goes back to password-only sign-in.',
    },
    regenerate: {
      icon: KeyRound,
      title: 'New recovery codes',
      subtitle: 'Your previous codes stop working immediately.',
    },
  }[mode]

  const submitLabel =
    step === 'codes'
      ? 'Done'
      : step === 'qr'
        ? 'I’ve scanned it — continue'
        : step === 'verify'
          ? 'Verify code'
          : mode === 'disable'
            ? 'Turn off'
            : mode === 'regenerate'
              ? 'Generate new codes'
              : 'Continue'

  const sub = v2 ? 'text-muted' : 'text-white/60'

  return (
    <EntityFormModal
      open={open}
      onClose={busy ? undefined : handleClose}
      icon={headers.icon}
      title={headers.title}
      subtitle={headers.subtitle}
      onSubmit={onSubmit}
      saving={busy}
      error={error}
      submitLabel={submitLabel}
    >
      {step === 'password' && (
        <Field label="Confirm your password" span={2} index={0}>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            autoFocus
            className={fieldInput}
            placeholder="Your password"
          />
        </Field>
      )}

      {step === 'qr' && (
        <div className="sm:col-span-2">
          <p className={`text-[13.5px] leading-snug ${sub}`}>
            Scan this with your authenticator app (Google Authenticator, 1Password, Authy…).
          </p>
          <div className="mt-3 flex justify-center">
            <div className="rounded-2xl bg-white p-3 shadow-lg">
              {qrDataUrl && (
                <img src={qrDataUrl} alt="Authenticator QR code" width={220} height={220} />
              )}
            </div>
          </div>
          <p className={`mt-3 text-[12.5px] ${sub}`}>Can&rsquo;t scan? Enter this key manually:</p>
          <div className="mt-1.5 flex items-center gap-2">
            <code
              className={`min-w-0 flex-1 break-all rounded-lg border px-3 py-2 font-mono text-[13px] tracking-[0.06em] ${
                v2
                  ? 'border-rule bg-section text-navy'
                  : 'border-white/15 bg-navy-deep/50 text-gold-light'
              }`}
            >
              {secret}
            </code>
            <button
              type="button"
              onClick={copySecret}
              aria-label="Copy secret key"
              className={`shrink-0 rounded-lg border p-2 transition-colors ${
                v2
                  ? 'border-rule text-navy hover:border-gold'
                  : 'border-white/20 text-white/85 hover:border-gold/60'
              }`}
            >
              {secretCopied ? <Check size={15} className="text-gold" /> : <Copy size={15} />}
            </button>
          </div>
        </div>
      )}

      {step === 'verify' && (
        <Field
          label="6-digit code"
          hint="From your authenticator app — it refreshes every 30 seconds."
          span={2}
          index={0}
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            spellCheck={false}
            placeholder="123456"
            className={`${fieldInput} text-center font-mono text-[20px] tracking-[0.35em]`}
          />
        </Field>
      )}

      {step === 'confirm' && (
        <>
          {mode === 'disable' && (
            <p className={`sm:col-span-2 text-[13.5px] leading-snug ${v2 ? 'text-danger' : 'text-red-300'}`}>
              This removes the extra sign-in step and deletes your recovery codes.
            </p>
          )}
          <Field label="Your password" span={2} index={0}>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              autoFocus
              className={fieldInput}
              placeholder="Your password"
            />
          </Field>
          <Field
            label="Authenticator or recovery code"
            hint="A current 6-digit code, or one of your saved recovery codes."
            span={2}
            index={1}
          >
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="one-time-code"
              spellCheck={false}
              placeholder="123456 or XXXXX-XXXXX"
              className={`${fieldInput} font-mono tracking-[0.12em]`}
            />
          </Field>
        </>
      )}

      {step === 'codes' && (
        <BackupCodesPanel
          codes={backupCodes}
          v2={v2}
          allSaved={allSaved}
          onAllSaved={setAllSaved}
          celebrate={mode === 'enable'}
        />
      )}
    </EntityFormModal>
  )
}
