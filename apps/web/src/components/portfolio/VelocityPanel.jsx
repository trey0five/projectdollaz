// ─────────────────────────────────────────────────────────────────────────────
// VelocityPanel — AIC Phase I. IS THE IMPROVEMENT WORK ACTUALLY MOVING?
//
// A diocese can adopt fourteen initiatives and move nothing. This panel answers
// the only question that matters after the adoption: over the window, did the
// initiatives with real observations go up, stay level, or go down.
//
// THE RULE (spec §4.5(3), §7.1): `basis: 'insufficient'` RENDERS THE SERVER'S
// LITERAL REASON — never a zero and never a dash. An initiative with one
// observation, or two taken a week apart, has not moved "0 points": we cannot see
// whether it moved at all, and those are different facts. The server refuses to
// emit a delta below two observations spanning MIN_PROJECTION_SPAN_DAYS, and this
// panel refuses to fill the hole it leaves.
//
// Every number here is the server's own count or delta. Nothing is summed,
// averaged or re-derived on the client.
// ─────────────────────────────────────────────────────────────────────────────
import { ArrowDownRight, ArrowRight, ArrowUpRight, Gauge } from 'lucide-react'
import { humanizeToken } from './AttentionBandChip.jsx'

/** A signed delta in PERCENTAGE POINTS → '+4.0 pts'. null → null, never '0'. */
export function deltaText(delta) {
  if (delta == null || !Number.isFinite(delta)) return null
  const rounded = Math.round(delta * 10) / 10
  const sign = rounded > 0 ? '+' : rounded < 0 ? '−' : '±'
  return `${sign}${Math.abs(rounded).toFixed(1)} pts`
}

function DeltaIcon({ delta }) {
  if (delta == null || !Number.isFinite(delta)) return null
  if (delta > 0) return <ArrowUpRight size={14} aria-hidden className="text-emerald-600" />
  if (delta < 0) return <ArrowDownRight size={14} aria-hidden className="text-danger" />
  return <ArrowRight size={14} aria-hidden className="text-muted" />
}

function Tally({ label, value }) {
  return (
    <div className="rounded-xl border border-rule/70 bg-section px-3.5 py-2.5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">{label}</p>
      <p className="mt-0.5 text-[18px] font-semibold tabular-nums text-navy">
        {Number.isFinite(value) ? value : '—'}
      </p>
    </div>
  )
}

function SchoolRow({ row }) {
  const observed = row?.basis === 'observed'
  const delta = observed ? deltaText(row?.deltaPctPoints) : null
  return (
    <li className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-rule/50 px-4 py-3 last:border-b-0">
      <span className="min-w-0">
        <span className="font-semibold text-navy">{row?.name ?? 'Unnamed school'}</span>
        <span className="ml-2 text-[12px] text-muted">
          {Number.isFinite(row?.initiatives) ? `${row.initiatives} initiatives` : 'initiatives —'}
          {Number.isFinite(row?.observations) ? ` · ${row.observations} observations` : ''}
        </span>
      </span>
      {delta ? (
        <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold tabular-nums text-navy">
          <DeltaIcon delta={row?.deltaPctPoints} />
          {delta}
        </span>
      ) : (
        // The literal reason. Never a zero, never an em-dash standing in for one.
        <span className="text-[12.5px] text-muted">
          Not measurable yet — {humanizeToken(row?.reason)?.toLowerCase() ?? 'reason not stated'}
        </span>
      )}
    </li>
  )
}

export default function VelocityPanel({ data = null, loading = false, error = '' }) {
  if (loading) {
    return (
      <section className="card-soft px-5 py-6 sm:px-6">
        <p className="text-[13.5px] text-muted">Reading improvement velocity…</p>
      </section>
    )
  }
  if (error) {
    return (
      <section className="card-soft px-5 py-6 sm:px-6">
        <h2 className="font-serif text-[17px] font-semibold text-navy">Improvement velocity</h2>
        <p className="mt-1 text-[13.5px] text-muted">{error}</p>
      </section>
    )
  }
  if (!data) return null

  const org = data.org ?? {}
  const schools = Array.isArray(data.schools) ? data.schools : []
  const notes = Array.isArray(data.notes) ? data.notes : []

  return (
    <section aria-labelledby="portfolio-velocity" className="card-soft overflow-hidden">
      <div className="flex items-start gap-3 px-5 pb-3 pt-5 sm:px-6">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-section text-muted">
          <Gauge size={18} aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 id="portfolio-velocity" className="font-serif text-[17px] font-semibold text-navy">
            Improvement velocity
          </h2>
          <p className="mt-0.5 text-[13px] text-muted">
            Movement observed over the last {Number.isFinite(data.windowDays) ? data.windowDays : '—'}{' '}
            days{data.asOf ? `, as of ${data.asOf}` : ''}. Only initiatives with two readings far
            enough apart to show movement are counted.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 px-5 sm:grid-cols-4 sm:px-6">
        <Tally label="Improved" value={org.improved} />
        <Tally label="Level" value={org.flat} />
        <Tally label="Declined" value={org.declined} />
        <Tally label="Unresponded findings" value={org.unresponded} />
      </div>

      {org.basis === 'insufficient' && (
        <p className="px-5 pt-3 text-[12.5px] text-muted sm:px-6">
          Organization-wide movement is not measurable yet —{' '}
          {humanizeToken(org.reason)?.toLowerCase() ?? 'reason not stated'}.
        </p>
      )}

      <p className="px-5 pt-3 text-[12px] text-muted sm:px-6">
        {Number.isFinite(org.initiativesWithObservations) && Number.isFinite(org.initiatives)
          ? `${org.initiativesWithObservations} of ${org.initiatives} initiatives carry observations in this window.`
          : null}
      </p>

      {schools.length > 0 && (
        <ul className="mt-3 border-t border-rule/60">
          {schools.map((row) => (
            <SchoolRow key={row?.schoolId ?? row?.name} row={row} />
          ))}
        </ul>
      )}

      {notes.length > 0 && (
        <ul className="space-y-1 px-5 py-4 sm:px-6">
          {notes.map((n, i) => (
            <li key={i} className="text-[12.5px] leading-snug text-muted">
              {n}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
