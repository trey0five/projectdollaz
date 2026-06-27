// Step 1 — Period & Granularity. Pick the period (defaults to the live FY) and a
// granularity. Annual is the only LIVE option; Monthly/Quarterly are SHOWN but
// disabled with a "coming soon" subnote (the PUT/assemble reject non-annual; the
// UI never sends it). Selecting a period fires the assemble GET (via the hook,
// keyed on draft.periodId). Next is enabled once a period with a snapshot exists.
import { CalendarRange, Lock } from 'lucide-react'
import { formatShortDate } from '../../../../lib/format.js'
import WizardNav from './WizardNav.jsx'

const GRANULARITIES = [
  { id: 'annual', label: 'Annual', enabled: true },
  { id: 'quarterly', label: 'Quarterly', enabled: false },
  { id: 'monthly', label: 'Monthly', enabled: false },
]

export default function Step1Period({ ctx }) {
  const { periods, draft, dispatch, goTo, loading, data } = ctx
  const snapshotPeriods = (periods || []).filter((p) => p.hasSnapshot)
  const list = snapshotPeriods.length ? snapshotPeriods : periods || []

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
          Monthly &amp; quarterly need monthly trial balances (coming soon). Annual is available now.
        </p>
      </div>

      <WizardNav
        onNext={() => goTo(2)}
        nextDisabled={!draft.periodId || loading || !data}
        nextLabel={loading ? 'Loading…' : 'Confirm financials'}
      />
    </div>
  )
}
