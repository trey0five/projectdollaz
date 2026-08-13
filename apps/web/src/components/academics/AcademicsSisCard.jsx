// ─────────────────────────────────────────────────────────────────────────────
// AcademicsSisCard — where classroom data comes from, told honestly.
//
// Academics does NOT hold its own SIS credentials. The connection made under
// Enrollment is the school's one connection, and this card reads its live state
// so the answer to "are we connected?" is the same answer in both modules.
//
// It deliberately does not offer a "Sync grades" button. The OneRoster Gradebook
// adapter is not built, and a button that quietly does nothing is worse than a
// sentence that says so — a superintendent who clicks it once and gets nothing
// stops trusting every other number on the page.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Clock, Plug, Upload } from 'lucide-react'
import { enrollmentApi } from '../../lib/api.js'

const HUE = '#0D9488'

/** Providers whose gradebook API we can read once the adapter lands. */
const GRADEBOOK_CAPABLE = new Set(['oneroster_api', 'blackbaud_sky'])

export default function AcademicsSisCard({ schoolId }) {
  const [status, setStatus] = useState(null)
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!schoolId) return undefined
    enrollmentApi
      .status(schoolId)
      .then((res) => {
        if (!cancelled) setStatus(res?.data ?? res ?? null)
      })
      .catch(() => {
        // A failed status read is not an error worth showing here — the card's
        // job is the explanation, and the file route below works either way.
      })
      .finally(() => {
        if (!cancelled) setChecked(true)
      })
    return () => {
      cancelled = true
    }
  }, [schoolId])

  const provider = status?.source?.provider ?? status?.provider ?? null
  const connected = Boolean(provider)
  const capable = provider ? GRADEBOOK_CAPABLE.has(provider) : false

  return (
    <div className="rounded-2xl border border-navy/10 bg-white p-5">
      <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em]" style={{ color: HUE }}>
        Student information system
      </p>
      <h3 className="mt-0.5 font-serif text-[19px] font-semibold text-navy">Where classroom data comes from</h3>

      <div className="mt-3 flex items-start gap-2.5 rounded-xl px-4 py-3" style={{ background: `${HUE}0D` }}>
        {!checked ? (
          <>
            <Clock size={15} className="mt-0.5 shrink-0 text-muted" />
            <p className="text-[12.5px] text-muted">Checking your connection…</p>
          </>
        ) : connected ? (
          <>
            <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-600" />
            <p className="text-[12.5px] text-navy">
              Connected to <b>{labelFor(provider)}</b> under Enrollment — the same connection serves this module, so
              there is nothing separate to set up here.{' '}
              {capable
                ? 'Live grade sync for this provider is being finished; until it ships, upload a gradebook export.'
                : 'This provider exposes rostering but not marks, so grades come in by file.'}
            </p>
          </>
        ) : (
          <>
            <Plug size={15} className="mt-0.5 shrink-0 text-muted" />
            <p className="text-[12.5px] text-navy">
              No SIS connected yet. Academics uses the school&rsquo;s existing connection rather than asking for a
              second set of credentials — set it up once under{' '}
              <Link to="/enrollment?tab=add" className="font-semibold underline" style={{ color: HUE }}>
                Enrollment
              </Link>{' '}
              and it serves both.
            </p>
          </>
        )}
      </div>

      <div className="mt-3 flex items-start gap-2.5 rounded-xl bg-navy/[0.04] px-4 py-3">
        <Upload size={15} className="mt-0.5 shrink-0 text-muted" />
        <p className="text-[12.5px] text-muted">
          Files work with no connection at all, and are how most schools start: an assessment results file, or a
          gradebook export. Both preview before they save.
        </p>
      </div>
    </div>
  )
}

function labelFor(provider) {
  const map = {
    oneroster_api: 'OneRoster',
    oneroster_csv: 'OneRoster (files)',
    blackbaud_sky: 'Blackbaud',
    facts: 'FACTS',
    veracross: 'Veracross',
  }
  return map[provider] ?? provider
}
