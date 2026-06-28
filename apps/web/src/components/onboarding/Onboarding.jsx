// First-login setup. Shown (via the AuthedLayout gate) when a logged-in user has
// no school yet — instead of dropping them on an empty dashboard. Confirms their
// name and creates their first school (which bootstraps the org + a free trial);
// opening balances are optional (usually derived from the first upload).
import { useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { GraduationCap } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useSchools } from '../../context/SchoolContext.jsx'
import { authApi, apiErrorMessage } from '../../lib/api.js'
import { sanitizeDecimal } from '../../lib/numericInput.js'
import { TextField, FormError } from '../auth/fields.jsx'

const labelCls = 'mb-2 block text-[14px] font-semibold uppercase tracking-[0.14em] text-muted'
const inputCls =
  'w-full rounded-lg border-2 border-border bg-white px-4 py-3 text-base text-ink outline-none transition-colors focus:border-gold'

export default function Onboarding() {
  const { user, refreshMe } = useAuth()
  const { createSchool, setActiveSchool } = useSchools()
  const navigate = useNavigate()

  const [firstName, setFirstName] = useState(user?.first_name || '')
  const [lastName, setLastName] = useState(user?.last_name || '')
  const [schoolName, setSchoolName] = useState('')
  const [showBalances, setShowBalances] = useState(false)
  const [begin, setBegin] = useState('')
  const [pyBegin, setPyBegin] = useState('')
  const [auditBegin, setAuditBegin] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const num = (v) => {
    const n = Number(v)
    return Number.isFinite(n) ? n : 0
  }

  const submit = async () => {
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
      if (created?.id) setActiveSchool(created.id)
      navigate('/')
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not finish setup. Please try again.'))
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-deep bg-navy-radial px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[560px] rounded-2xl border border-gold/20 bg-cream p-6 shadow-login sm:p-8"
      >
        <div className="mb-5 flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gold-gradient text-white shadow-glow">
            <GraduationCap size={22} />
          </span>
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.16em] text-gold">
              Welcome to FinRep
            </p>
            <h1 className="font-serif text-2xl font-semibold leading-tight text-navy">
              Let’s set up your school{firstName ? `, ${firstName}` : ''}
            </h1>
          </div>
        </div>
        <p className="mb-6 text-[15.5px] leading-relaxed text-muted">
          A couple of quick details to get started — you can change any of this later in Settings.
        </p>

        <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
          <TextField
            label="First name"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            autoComplete="given-name"
          />
          <TextField
            label="Last name"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            autoComplete="family-name"
          />
        </div>

        <TextField
          label="School name"
          value={schoolName}
          onChange={(e) => setSchoolName(e.target.value)}
          placeholder="e.g. Sample High School"
        />

        <button
          type="button"
          onClick={() => setShowBalances((s) => !s)}
          className="mb-2 text-[14.5px] font-semibold text-gold transition-colors hover:text-gold-light"
        >
          {showBalances ? '− Hide' : '+ Add'} opening net-asset balances (optional)
        </button>
        {showBalances && (
          <div className="mb-4 rounded-xl border border-gold/25 bg-navy/[0.02] p-4">
            <p className="mb-3 text-[14px] italic text-muted">
              Optional — these are usually derived automatically from your first trial-balance
              upload.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={labelCls}>Current year</label>
                <input
                  className={inputCls}
                  inputMode="decimal"
                  value={begin}
                  onChange={(e) => setBegin(sanitizeDecimal(e.target.value, { allowNegative: true }))}
                />
              </div>
              <div>
                <label className={labelCls}>Prior year</label>
                <input
                  className={inputCls}
                  inputMode="decimal"
                  value={pyBegin}
                  onChange={(e) => setPyBegin(sanitizeDecimal(e.target.value, { allowNegative: true }))}
                />
              </div>
              <div>
                <label className={labelCls}>Audited</label>
                <input
                  className={inputCls}
                  inputMode="decimal"
                  value={auditBegin}
                  onChange={(e) =>
                    setAuditBegin(sanitizeDecimal(e.target.value, { allowNegative: true }))
                  }
                />
              </div>
            </div>
          </div>
        )}

        {err && <FormError>{err}</FormError>}

        <motion.button
          whileTap={{ scale: schoolName.trim() ? 0.98 : 1 }}
          onClick={submit}
          disabled={!schoolName.trim() || busy}
          className="btn-primary mt-5 w-full disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Setting up…' : 'Create my school'}
        </motion.button>
      </motion.div>
    </div>
  )
}
