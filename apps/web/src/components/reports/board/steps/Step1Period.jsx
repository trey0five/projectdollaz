// Step 1 — Period & Granularity. Pick the period (defaults to the live FY) and a
// granularity. Annual and Monthly are LIVE; Quarterly is SHOWN but disabled with a
// "coming soon" subnote. Selecting a period fires the assemble GET (via the hook,
// keyed on draft.periodId/granularity/monthKey). When Monthly is chosen a month
// picker lists ONLY the months with a loaded snapshot (monthlyApi.list); selecting
// one threads monthKey through to the NBOA MTD/YTD board view. Next is enabled once
// a period (and, for monthly, a month) with a snapshot is loaded.
import { useEffect, useState } from 'react'
import { CalendarRange, Lock, CalendarDays, Upload } from 'lucide-react'
import { formatShortDate } from '../../../../lib/format.js'
import { monthlyApi } from '../../../../lib/api.js'
import WizardNav from './WizardNav.jsx'

const GRANULARITIES = [
  { id: 'annual', label: 'Annual', enabled: true },
  { id: 'quarterly', label: 'Quarterly', enabled: false },
  { id: 'monthly', label: 'Monthly', enabled: true },
]

// "2025-11" -> last day of that calendar month -> "For the period ended November
// 30, 2025" (NBOA monthly heading). Pure, null-safe; no server round-trip.
function monthEndLabel(monthKey) {
  if (!monthKey || typeof monthKey !== 'string') return monthKey || ''
  const [y, m] = monthKey.split('-').map(Number)
  if (!y || !m) return monthKey
  // Day 0 of the next month = last day of this month (handles 28/29/30/31).
  const d = new Date(y, m, 0)
  return `For the period ended ${d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })}`
}

// Short chip label for a month: "November 2025".
function monthChipLabel(monthKey) {
  if (!monthKey || typeof monthKey !== 'string') return monthKey || ''
  const [y, m] = monthKey.split('-').map(Number)
  if (!y || !m) return monthKey
  const d = new Date(y, m - 1, 1)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
}

export default function Step1Period({ ctx }) {
  const { schoolId, periods, draft, dispatch, goTo, loading, data, monthError } = ctx
  const snapshotPeriods = (periods || []).filter((p) => p.hasSnapshot)
  const list = snapshotPeriods.length ? snapshotPeriods : periods || []

  // Loaded monthly snapshots for the chosen period (only these are selectable).
  const [months, setMonths] = useState([])
  const [monthsLoading, setMonthsLoading] = useState(false)

  useEffect(() => {
    let cancelled = false
    const sid = schoolId
    const pid = draft.periodId
    // Defer the first setState out of the effect body (microtask) to satisfy
    // react-hooks/set-state-in-effect — mirrors the hook layer's await-before-
    // setState pattern.
    Promise.resolve().then(() => {
      if (cancelled) return
      if (!sid || !pid) {
        setMonths([])
        return
      }
      setMonthsLoading(true)
      monthlyApi
        .list(sid, pid)
        .then((res) => {
          if (cancelled) return
          const rows = res?.data?.months || []
          // Each summary carries a monthKey ("YYYY-MM"); sort chronologically.
          const keys = rows
            .map((r) => r?.monthKey)
            .filter(Boolean)
            .sort()
          setMonths(keys)
        })
        .catch(() => {
          if (!cancelled) setMonths([])
        })
        .finally(() => {
          if (!cancelled) setMonthsLoading(false)
        })
    })
    return () => {
      cancelled = true
    }
  }, [schoolId, draft.periodId])

  const isMonthly = draft.granularity === 'monthly'
  const needsMonth = isMonthly && !draft.monthKey

  return (
    <div>
      <header className="mb-5">
        <h2 className="font-serif text-2xl font-semibold text-navy">Choose a reporting period</h2>
        <p className="mt-1 text-[13.5px] text-muted">
          The board report assembles from this period&apos;s saved statements and budget.
        </p>
      </header>

      {list.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border bg-section px-4 py-8 text-center text-[13.5px] italic text-muted">
          No periods yet. Generate statements for a period first, then come back to build the report.
        </p>
      ) : (
        <div className="mb-6 flex flex-wrap gap-2">
          {list.map((p) => {
            const active = p.id === draft.periodId
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => dispatch({ type: 'setPeriod', periodId: p.id })}
                className={`flex items-center gap-2 rounded-lg border px-3.5 py-2 text-[13px] font-semibold transition-all ${
                  active
                    ? 'border-gold/60 bg-gold/10 text-navy shadow-card'
                    : 'border-rule/60 text-muted hover:border-gold/50 hover:text-navy'
                }`}
                title={`Period end ${formatShortDate(p.periodEndDate)}`}
              >
                <CalendarRange size={15} className={active ? 'text-gold' : 'text-muted'} />
                {p.label}
                {!p.hasSnapshot && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                    no statements
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      <div className="mb-2">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-gold">Granularity</p>
        <div className="flex flex-wrap gap-2">
          {GRANULARITIES.map((g) => {
            const active = g.id === draft.granularity && g.enabled
            return (
              <button
                key={g.id}
                type="button"
                disabled={!g.enabled}
                onClick={() => g.enabled && dispatch({ type: 'setField', field: 'granularity', value: g.id })}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-[13px] font-semibold transition-all ${
                  active
                    ? 'border-gold/60 bg-gold/10 text-navy'
                    : g.enabled
                      ? 'border-rule/60 text-muted hover:border-gold/50 hover:text-navy'
                      : 'cursor-not-allowed border-rule/50 text-muted/60'
                }`}
              >
                {!g.enabled && <Lock size={12} />}
                {g.label}
              </button>
            )
          })}
        </div>
        <p className="mt-2 text-[12px] italic text-muted">
          Annual and monthly (NBOA MTD &amp; YTD) are available. Quarterly is coming soon.
        </p>
      </div>

      {isMonthly && (
        <div className="mt-5 rounded-xl border border-rule/60 bg-section/60 px-4 py-4">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-gold">
            <CalendarDays size={13} className="text-gold" />
            Reporting month
          </p>

          {!draft.periodId ? (
            <p className="text-[12.5px] italic text-muted">Select a period to choose a month.</p>
          ) : monthsLoading ? (
            <p className="text-[12.5px] italic text-muted">Loading loaded months…</p>
          ) : months.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border bg-white/60 px-4 py-5 text-center">
              <p className="text-[13px] font-semibold text-navy">No monthly actuals loaded yet</p>
              <p className="mt-1 text-[12.5px] text-muted">
                Monthly MTD/YTD reporting needs at least one month of trial-balance actuals.
              </p>
              <a
                href="/reports"
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-gold/60 bg-gold/10 px-3.5 py-2 text-[12.5px] font-semibold text-navy transition-all hover:bg-gold/20"
              >
                <Upload size={13} className="text-gold" />
                Upload Monthly Actuals
              </a>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {months.map((mk) => {
                const active = mk === draft.monthKey
                return (
                  <button
                    key={mk}
                    type="button"
                    onClick={() => dispatch({ type: 'setField', field: 'monthKey', value: mk })}
                    className={`flex flex-col items-start gap-0.5 rounded-lg border px-3.5 py-2 text-left transition-all ${
                      active
                        ? 'border-gold/60 bg-gold/10 text-navy shadow-card'
                        : 'border-rule/60 text-muted hover:border-gold/50 hover:text-navy'
                    }`}
                    title={monthEndLabel(mk)}
                  >
                    <span className="text-[13px] font-semibold">{monthChipLabel(mk)}</span>
                    <span className={`text-[10.5px] ${active ? 'text-navy/70' : 'text-muted/80'}`}>
                      {monthEndLabel(mk)}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {monthError && (
            <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[12px] font-medium text-amber-800">
              {monthError}
            </p>
          )}
        </div>
      )}

      <WizardNav
        onNext={() => goTo(2)}
        nextDisabled={!draft.periodId || needsMonth || loading || !data}
        nextLabel={loading ? 'Loading…' : 'Confirm financials'}
      />
    </div>
  )
}
