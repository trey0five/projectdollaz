// Shown inside the authed app when the user has NO schools yet. Creates the
// first school (name + the three begin-balances the engine needs) via POST
// /schools, which also grants the caller an OWNER membership. On success the
// SchoolContext selects it and the dashboard renders.
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Building2 } from 'lucide-react'
import { useSchools } from '../context/SchoolContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { apiErrorMessage } from '../lib/api.js'

const labelCls = 'mb-2 block text-[14px] font-semibold uppercase tracking-[0.14em] text-muted'
const inputCls =
  'w-full rounded-lg border-2 border-border bg-white px-4 py-3 text-base text-ink outline-none transition-colors focus:border-gold'

export default function CreateSchoolForm() {
  const { createSchool } = useSchools()
  const { logout } = useAuth()
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    if (!name.trim() || busy) return
    setError('')
    setBusy(true)
    try {
      // Name only — opening net-asset balances are derived from the uploaded
      // trial balances (see OpeningBalances / AppContext), not entered here.
      await createSchool({ name: name.trim() })
    } catch (err) {
      setError(apiErrorMessage(err, 'Could not create the school.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-navy-deep bg-navy-radial px-4 py-6 sm:py-10">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative w-full max-w-[520px] rounded-2xl border-t-4 border-gold bg-cream px-6 py-10 shadow-login sm:px-10 sm:py-12"
      >
        <div className="mb-5 flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gold/15 text-gold">
            <Building2 size={24} />
          </span>
          <div>
            <h1 className="font-serif text-[26px] font-semibold leading-tight text-navy">
              Create your school
            </h1>
            <p className="text-[15px] text-muted">Just a name to start — opening balances are read from your first trial-balance upload.</p>
          </div>
        </div>

        <div className="mb-5">
          <label className={labelCls}>School name</label>
          <input
            className={inputCls}
            value={name}
            placeholder="e.g. Sample 01 High School"
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {error && (
          <div className="mb-3 rounded-md bg-danger/10 px-3 py-2 text-center text-[15px] text-danger">
            {error}
          </div>
        )}

        <motion.button
          whileTap={{ scale: name.trim() ? 0.98 : 1 }}
          onClick={submit}
          disabled={!name.trim() || busy}
          className="btn-primary w-full disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create School'}
        </motion.button>

        <button
          onClick={logout}
          className="mt-4 w-full text-center text-[15px] font-semibold text-muted hover:text-gold"
        >
          Sign out
        </button>
      </motion.div>
    </div>
  )
}
