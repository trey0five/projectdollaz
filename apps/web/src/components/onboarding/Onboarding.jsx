// ─────────────────────────────────────────────────────────────────────────────
// First-login onboarding — a four-step frosted-glass wizard over the same navy
// aurora as the auth pages (via the AuthedLayout gate when a signed-in user has
// no school yet):
//   1 You        — confirm the name we greet you by.
//   2 School     — school name (+ optional organization name for dioceses /
//                  networks, + optional opening net-asset balances). Creating
//                  the school here bootstraps the org + free trial; an org name
//                  renames the auto-created organization right after.
//   3 Security   — OPTIONAL two-factor setup, reusing the full MfaWizard
//                  lifecycle (QR → verify → recovery codes) as a modal.
//   4 QuickBooks — OPTIONAL QuickBooks Online connect (leaves for Intuit OAuth;
//                  the callback route is exempt from the gate), or finish.
// The wizard must SURVIVE its own success: the gate keys on "no schools", which
// flips at step 2 — so a module-scoped session flag keeps the gate pointed here
// until the user actually finishes (isOnboardingSessionActive, read by App.jsx).
// A reload after step 2 simply lands in the app — school exists, nothing lost.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  UserRound,
  GraduationCap,
  ShieldCheck,
  Link2,
  Check,
  ChevronLeft,
  Building2,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useSchools } from '../../context/SchoolContext.jsx'
import { authApi, orgsApi, qboApi, apiErrorMessage } from '../../lib/api.js'
import { sanitizeDecimal } from '../../lib/numericInput.js'
import { AuroraBackdrop, BrandLockup, GlassCard } from '../auth/AuthLayout.jsx'
import {
  GlassTextField,
  GlassFormError,
  glassLabel,
  glassInput,
} from '../auth/glassFields.jsx'
import MfaWizard from '../settings/MfaWizard.jsx'
import { onboardingSession } from './onboardingSession.js'

const STEPS = [
  { key: 'you', label: 'You', icon: UserRound },
  { key: 'school', label: 'Your school', icon: GraduationCap },
  { key: 'secure', label: 'Security', icon: ShieldCheck },
  { key: 'connect', label: 'QuickBooks', icon: Link2 },
]

/** Step rail: icon nodes joined by a progress line that fills as you advance. */
function StepRail({ index }) {
  return (
    <div className="mx-auto mb-7 flex w-full max-w-[440px] items-start">
      {STEPS.map((s, i) => {
        const stateCls =
          i < index
            ? 'border-gold/70 bg-gold text-navy shadow-glow'
            : i === index
              ? 'border-gold/80 bg-gold/15 text-gold-light shadow-[0_0_22px_rgb(var(--c-glow)_/_0.35)]'
              : 'border-white/15 bg-white/[0.05] text-white/35'
        const Icon = s.icon
        return (
          <div key={s.key} className={`flex items-center ${i > 0 ? 'flex-1' : ''}`}>
            {i > 0 && (
              <div className="relative mx-1 h-[2px] flex-1 overflow-hidden rounded-full bg-white/10 sm:mx-2">
                <motion.span
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-gold to-gold-light"
                  initial={false}
                  animate={{ width: i <= index ? '100%' : '0%' }}
                  transition={{ duration: 0.45, ease: 'easeOut' }}
                />
              </div>
            )}
            <div className="flex flex-col items-center">
              <motion.span
                initial={false}
                animate={{ scale: i === index ? 1.08 : 1 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                className={`flex h-11 w-11 items-center justify-center rounded-full border-2 transition-colors duration-300 ${stateCls}`}
              >
                {i < index ? <Check size={19} strokeWidth={3} /> : <Icon size={19} />}
              </motion.span>
              <span
                className={`mt-1.5 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.12em] ${
                  i <= index ? 'text-gold-light/90' : 'text-white/35'
                }`}
              >
                {s.label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

const panelVariants = {
  enter: (dir) => ({ opacity: 0, x: dir >= 0 ? 56 : -56, scale: 0.985 }),
  center: { opacity: 1, x: 0, scale: 1 },
  exit: (dir) => ({ opacity: 0, x: dir >= 0 ? -56 : 56, scale: 0.985 }),
}

/** Optional-step hero chip: glowing icon in a ringed disc. */
function StepHero({ icon: Icon, tint = 'gold', children }) {
  const reduce = useReducedMotion()
  const tintCls =
    tint === 'qb' ? 'bg-[#2CA01C]/15 text-[#53c43f]' : 'bg-gold/15 text-gold-light'
  const ringCls = tint === 'qb' ? 'border-[#2CA01C]/50' : 'border-gold/50'
  return (
    <div className="mb-5 flex items-center gap-4">
      <span className={`relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${tintCls}`}>
        {!reduce && (
          <motion.span
            aria-hidden
            className={`absolute inset-0 rounded-2xl border-2 ${ringCls}`}
            initial={{ scale: 1, opacity: 0.8 }}
            animate={{ scale: 1.45, opacity: 0 }}
            transition={{ duration: 2.2, ease: 'easeOut', repeat: Infinity, repeatDelay: 0.6 }}
          />
        )}
        <Icon size={26} />
      </span>
      <div>{children}</div>
    </div>
  )
}

export default function Onboarding() {
  const { user, refreshMe } = useAuth()
  const { createSchool, setActiveSchool } = useSchools()
  const navigate = useNavigate()
  const reduce = useReducedMotion()

  const [index, setIndex] = useState(0)
  const [dir, setDir] = useState(1)
  const [firstName, setFirstName] = useState(user?.first_name || '')
  const [lastName, setLastName] = useState(user?.last_name || '')
  const [schoolName, setSchoolName] = useState('')
  const [orgName, setOrgName] = useState('')
  const [showBalances, setShowBalances] = useState(false)
  const [begin, setBegin] = useState('')
  const [pyBegin, setPyBegin] = useState('')
  const [auditBegin, setAuditBegin] = useState('')
  const [schoolId, setSchoolId] = useState(null)
  const [mfaOpen, setMfaOpen] = useState(false)
  const [mfaOn, setMfaOn] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState(false)

  // Hold the gate on this wizard for the whole session (see header comment).
  useEffect(() => {
    onboardingSession.set(true)
    return () => onboardingSession.set(false)
  }, [])

  const go = (next) => {
    setDir(next > index ? 1 : -1)
    setErr('')
    setIndex(next)
  }

  const num = (v) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }

  const createNow = async () => {
    if (!schoolName.trim() || busy) return
    setErr('')
    setBusy(true)
    try {
      if (firstName !== (user?.first_name || '') || lastName !== (user?.last_name || '')) {
        await authApi.updateMe({ first_name: firstName.trim(), last_name: lastName.trim() })
        await refreshMe()
      }
      const created = await createSchool({
        name: schoolName.trim(),
        ...(showBalances
          ? {
              netAssetsBegin: num(begin),
              pyNetAssetsBegin: num(pyBegin),
              auditNetAssetsBegin: num(auditBegin),
            }
          : {}),
      })
      if (created?.id) {
        setActiveSchool(created.id)
        setSchoolId(created.id)
      }
      // Diocese / network path: rename the auto-created organization. Best-effort
      // — a failure here shouldn't strand onboarding (rename lives in Settings).
      if (orgName.trim()) {
        try {
          const me = await orgsApi.me()
          if (me.data?.id) await orgsApi.update(me.data.id, { name: orgName.trim() })
        } catch {
          /* non-fatal */
        }
      }
      setBusy(false)
      go(2)
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not finish setup. Please try again.'))
      setBusy(false)
    }
  }

  const connectQuickBooks = async () => {
    if (!schoolId || busy) return
    setErr('')
    setBusy(true)
    try {
      const res = await qboApi.connectUrl(schoolId)
      onboardingSession.set(false) // leaving for Intuit; the callback route re-enters the app
      window.location.href = res.data.url
    } catch (e) {
      setErr(
        apiErrorMessage(
          e,
          'Could not start the QuickBooks connection — you can connect anytime from Settings → Integrations.',
        ),
      )
      setBusy(false)
    }
  }

  const finish = () => {
    setDone(true)
    window.setTimeout(
      () => {
        onboardingSession.set(false) // the gate re-renders to the app instantly
        navigate('/app')
      },
      reduce ? 300 : 1500,
    )
  }

  const canContinueYou = firstName.trim() && lastName.trim()

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-navy-deep bg-navy-radial px-4 py-8">
      <AuroraBackdrop />

      <div className="relative mb-6">
        <BrandLockup compact />
      </div>

      <div className="relative w-full max-w-[640px]">
        <motion.div
          aria-hidden
          className="absolute -inset-4 rounded-[34px] opacity-30 blur-2xl"
          style={{
            background:
              'linear-gradient(120deg, rgba(47,107,255,0.35), rgba(214,178,92,0.30) 55%, rgba(255,138,92,0.25))',
          }}
          animate={{ opacity: [0.22, 0.38, 0.22] }}
          transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
        />
        <motion.div
          initial={{ opacity: 0, y: 26, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1] }}
        >
          <GlassCard className="w-full px-6 py-8 sm:px-12 sm:py-10">
            <StepRail index={index} />

            <AnimatePresence mode="wait" custom={dir} initial={false}>
              {/* ── Step 1 · You ─────────────────────────────────────────── */}
              {index === 0 && (
                <motion.div
                  key="you"
                  custom={dir}
                  variants={panelVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                >
                  <p className="text-[12px] font-semibold uppercase tracking-[0.2em] text-gold-light/90">
                    Welcome to KYRO
                  </p>
                  <h1 className="mb-2 mt-1 font-serif text-[26px] font-semibold leading-tight text-white sm:text-[30px]">
                    Let&rsquo;s get you set up{firstName ? `, ${firstName.trim()}` : ''}
                  </h1>
                  <p className="mb-7 text-[15.5px] leading-relaxed text-white/60">
                    Two quick steps and your financial command center is live — you can change
                    any of this later in Settings.
                  </p>

                  <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                    <GlassTextField
                      label="First name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      autoComplete="given-name"
                    />
                    <GlassTextField
                      label="Last name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      autoComplete="family-name"
                    />
                  </div>

                  <motion.button
                    whileTap={{ scale: canContinueYou ? 0.98 : 1 }}
                    onClick={() => canContinueYou && go(1)}
                    disabled={!canContinueYou}
                    className="btn-gold mt-2 w-full py-3.5 text-[14px] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Continue
                  </motion.button>
                </motion.div>
              )}

              {/* ── Step 2 · School & organization ───────────────────────── */}
              {index === 1 && (
                <motion.div
                  key="school"
                  custom={dir}
                  variants={panelVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                >
                  <h1 className="mb-2 font-serif text-[26px] font-semibold leading-tight text-white sm:text-[28px]">
                    Name your school
                  </h1>
                  <p className="mb-6 text-[15.5px] leading-relaxed text-white/60">
                    This creates your workspace — statements, metrics and your board packet all
                    live here.
                  </p>

                  <GlassTextField
                    label="School name"
                    value={schoolName}
                    onChange={(e) => setSchoolName(e.target.value)}
                    placeholder="e.g. St. Mary Catholic High School"
                    autoFocus
                  />

                  <div className="mb-5">
                    <label className={glassLabel}>
                      <span className="inline-flex items-center gap-1.5">
                        <Building2 size={13} className="opacity-70" />
                        Organization <span className="normal-case tracking-normal text-white/35">— optional</span>
                      </span>
                    </label>
                    <input
                      className={glassInput}
                      value={orgName}
                      onChange={(e) => setOrgName(e.target.value)}
                      placeholder="e.g. Diocese of Springfield"
                    />
                    <p className="mt-1.5 text-[13px] leading-snug text-white/45">
                      Part of a diocese or school network? Name the organization and add more
                      schools to it later. Leave blank and we&rsquo;ll simply name it after your
                      school.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => setShowBalances((s) => !s)}
                    className="mb-2 text-[14.5px] font-semibold text-gold-light transition-colors hover:text-gold"
                  >
                    {showBalances ? '− Hide' : '+ Add'} opening net-asset balances (optional)
                  </button>
                  <AnimatePresence initial={false}>
                    {showBalances && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.28, ease: 'easeOut' }}
                        className="overflow-hidden"
                      >
                        <div className="mb-4 rounded-xl border border-white/10 bg-white/[0.04] p-4">
                          <p className="mb-3 text-[13.5px] italic leading-snug text-white/50">
                            Optional — these are usually derived automatically from your first
                            trial-balance upload.
                          </p>
                          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                            {[
                              ['Current year', begin, setBegin],
                              ['Prior year', pyBegin, setPyBegin],
                              ['Audited', auditBegin, setAuditBegin],
                            ].map(([label, value, set]) => (
                              <div key={label}>
                                <label className={glassLabel}>{label}</label>
                                <input
                                  className={glassInput}
                                  inputMode="decimal"
                                  value={value}
                                  onChange={(e) =>
                                    set(sanitizeDecimal(e.target.value, { allowNegative: true }))
                                  }
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <GlassFormError>{err}</GlassFormError>

                  <div className="mt-4 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => go(0)}
                      className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-white/15 px-4 text-[13px] font-semibold uppercase tracking-[0.1em] text-white/70 transition-colors hover:border-white/30 hover:text-white"
                    >
                      <ChevronLeft size={16} />
                      Back
                    </button>
                    <motion.button
                      whileTap={{ scale: schoolName.trim() ? 0.98 : 1 }}
                      onClick={createNow}
                      disabled={!schoolName.trim() || busy}
                      className="btn-gold flex-1 py-3.5 text-[14px] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {busy ? 'Creating your workspace…' : 'Create my school'}
                    </motion.button>
                  </div>
                </motion.div>
              )}

              {/* ── Step 3 · Security (optional MFA) ─────────────────────── */}
              {index === 2 && (
                <motion.div
                  key="secure"
                  custom={dir}
                  variants={panelVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                >
                  <StepHero icon={ShieldCheck}>
                    <h1 className="font-serif text-[24px] font-semibold leading-tight text-white sm:text-[27px]">
                      Protect your account
                    </h1>
                    <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/40">
                      Optional · about a minute
                    </p>
                  </StepHero>
                  <p className="mb-4 text-[15.5px] leading-relaxed text-white/65">
                    Your school&rsquo;s financials deserve more than a password. Two-factor
                    authentication asks for a 6-digit code from your phone at every sign-in.
                  </p>
                  <ul className="mb-6 space-y-2 text-[14.5px] text-white/60">
                    {[
                      'Works with Google Authenticator, 1Password, Authy and more',
                      '10 one-time recovery codes in case you lose your phone',
                      'Turn it off anytime in Settings → Account',
                    ].map((line) => (
                      <li key={line} className="flex items-start gap-2.5">
                        <Check size={16} className="mt-0.5 shrink-0 text-gold-light" />
                        {line}
                      </li>
                    ))}
                  </ul>

                  {mfaOn && (
                    <div className="mb-5 flex items-center gap-2.5 rounded-xl border border-emerald-400/25 bg-emerald-500/15 px-4 py-3 text-[14.5px] text-emerald-200">
                      <ShieldCheck size={17} className="shrink-0" />
                      Two-factor is on — recovery codes saved.
                    </div>
                  )}

                  <GlassFormError>{err}</GlassFormError>

                  {mfaOn ? (
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      onClick={() => go(3)}
                      className="btn-gold mt-2 w-full py-3.5 text-[14px]"
                    >
                      Continue
                    </motion.button>
                  ) : (
                    <>
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setMfaOpen(true)}
                        className="btn-gold mt-2 w-full py-3.5 text-[14px]"
                      >
                        Set up two-factor
                      </motion.button>
                      <button
                        type="button"
                        onClick={() => go(3)}
                        className="mt-4 w-full text-center text-[14.5px] font-medium text-white/50 transition-colors hover:text-white/80"
                      >
                        Skip for now — I&rsquo;ll do this later in Settings
                      </button>
                    </>
                  )}
                </motion.div>
              )}

              {/* ── Step 4 · QuickBooks (optional) ───────────────────────── */}
              {index === 3 && (
                <motion.div
                  key="connect"
                  custom={dir}
                  variants={panelVariants}
                  initial="enter"
                  animate="center"
                  exit="exit"
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                >
                  <StepHero icon={Link2} tint="qb">
                    <h1 className="font-serif text-[24px] font-semibold leading-tight text-white sm:text-[27px]">
                      Connect QuickBooks
                    </h1>
                    <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-white/40">
                      Optional · recommended
                    </p>
                  </StepHero>
                  <p className="mb-4 text-[15.5px] leading-relaxed text-white/65">
                    Link QuickBooks Online and KYRO pulls your trial balances automatically —
                    financial statements, metrics and your board packet build themselves.
                  </p>
                  <ul className="mb-6 space-y-2 text-[14.5px] text-white/60">
                    {[
                      'Secure, read-only connection through Intuit — disconnect anytime',
                      "You'll hop to Intuit to approve, then land right back in KYRO",
                      'No QuickBooks? Upload trial-balance spreadsheets instead',
                    ].map((line) => (
                      <li key={line} className="flex items-start gap-2.5">
                        <Check size={16} className="mt-0.5 shrink-0 text-[#53c43f]" />
                        {line}
                      </li>
                    ))}
                  </ul>

                  <GlassFormError>{err}</GlassFormError>

                  <div className="mt-2 flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => go(2)}
                      className="inline-flex min-h-[44px] items-center gap-1 rounded-xl border border-white/15 px-4 text-[13px] font-semibold uppercase tracking-[0.1em] text-white/70 transition-colors hover:border-white/30 hover:text-white"
                    >
                      <ChevronLeft size={16} />
                      Back
                    </button>
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      onClick={connectQuickBooks}
                      disabled={busy}
                      className="btn-gold flex-1 py-3.5 text-[14px] disabled:opacity-60"
                    >
                      {busy ? 'Opening Intuit…' : 'Connect QuickBooks'}
                    </motion.button>
                  </div>
                  <button
                    type="button"
                    onClick={finish}
                    className="mt-4 w-full text-center text-[14.5px] font-medium text-white/50 transition-colors hover:text-white/80"
                  >
                    Skip for now — take me to my dashboard
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </GlassCard>
        </motion.div>
      </div>

      {/* Full MFA lifecycle (QR → verify → recovery codes) as the app's modal. */}
      <MfaWizard
        open={mfaOpen}
        mode="enable"
        onClose={() => setMfaOpen(false)}
        onChanged={() => setMfaOn(true)}
      />

      {/* Completion beat: gold check bloom, then into the dashboard. */}
      <AnimatePresence>
        {done && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-navy-deep/80 backdrop-blur-xl"
          >
            <motion.span
              initial={reduce ? false : { scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
              className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gold text-navy shadow-glow"
            >
              {!reduce && (
                <motion.span
                  aria-hidden
                  className="absolute inset-0 rounded-full border-2 border-gold/70"
                  initial={{ scale: 1, opacity: 0.9 }}
                  animate={{ scale: 2.1, opacity: 0 }}
                  transition={{ duration: 1.1, ease: 'easeOut' }}
                />
              )}
              <Check size={46} strokeWidth={3} />
            </motion.span>
            <motion.p
              initial={reduce ? false : { opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="mt-6 flex items-center gap-2 font-serif text-[28px] font-semibold text-white"
            >
              <Sparkles size={22} className="text-gold-light" />
              You&rsquo;re all set{firstName ? `, ${firstName.trim()}` : ''}
            </motion.p>
            <motion.p
              initial={reduce ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="mt-2 text-[15px] text-white/60"
            >
              Opening your command center…
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
