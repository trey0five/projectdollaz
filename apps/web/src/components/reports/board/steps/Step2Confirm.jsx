// Step 2 — Confirm pulled financials (the empty-state gate). Reads availability
// from the assembled bundle (the web does NO math):
//   (a) !hasSnapshot          -> guidance card + link to /statements, Next disabled
//   (b) hasSnapshot,!hasBudget -> soft warning (variance shows Actual only), Next ON
//   (c) all present            -> "ready as of {dataAsOf}" + revenue/expense/surplus
//                                 tiles + KPI chips, read-only confirmation.
import { Link } from 'react-router-dom'
import { CheckCircle2, AlertTriangle, FileX2, TrendingUp } from 'lucide-react'
import { money, formatIndicator, dateTime } from '../boardReportUtils.js'
import WizardNav from './WizardNav.jsx'

export default function Step2Confirm({ ctx }) {
  const { data, goTo, loading } = ctx

  if (loading || !data) {
    return (
      <p className="py-10 text-center text-[14px] text-muted">Assembling this period&apos;s financials…</p>
    )
  }

  const av = data.availability || {}

  // (a) No snapshot — block, route to statements.
  if (!av.hasSnapshot) {
    return (
      <div>
        {header()}
        <div className="rounded-xl border border-amber-300/70 bg-amber-50 px-5 py-6">
          <div className="mb-2 flex items-center gap-2 text-amber-800">
            <FileX2 size={20} />
            <h3 className="font-serif text-lg font-semibold">No statements for this period yet</h3>
          </div>
          <p className="text-[13.5px] text-amber-900/80">
            The board report builds from a generated statement snapshot. Generate statements for{' '}
            <strong>{data.label}</strong> first, then return here.
          </p>
          <Link
            to="/statements"
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-amber-400 bg-white px-4 py-2 text-[13px] font-semibold text-amber-900 transition-colors hover:bg-amber-100"
          >
            Go to Statements
          </Link>
        </div>
        <WizardNav onBack={() => goTo(1)} nextDisabled nextLabel="Next" onNext={() => {}} />
      </div>
    )
  }

  const ops = data.operations
  const rev = ops?.revenueTotals
  const exp = ops?.expenseTotals
  const net = ops?.netSurplus
  const kpis = (data.keyIndicators || []).filter((k) => k.available && k.value != null)

  return (
    <div>
      {header()}

      <div className="mb-4 inline-flex items-center gap-2 rounded-lg border border-emerald-300/70 bg-emerald-50 px-3.5 py-2 text-[13px] font-semibold text-emerald-800">
        <CheckCircle2 size={16} />
        Financials ready{av.dataAsOf ? ` as of ${dateTime(av.dataAsOf)}` : ''}
      </div>

      {!av.hasBudget && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <span>
            No budget set for this period — variance columns will show <strong>actuals only</strong>.{' '}
            <Link to="/budget" className="font-semibold underline decoration-amber-400 underline-offset-2">
              Add a budget
            </Link>{' '}
            for full budget-vs-actual.
          </span>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        {tile('Total revenue', rev?.actual, 'emerald')}
        {tile('Total expenses', exp?.actual, 'rose')}
        {tile('Net surplus / (deficit)', net?.actual, 'gold')}
      </div>

      {kpis.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-gold">
            <TrendingUp size={13} /> Key indicators
          </p>
          <div className="flex flex-wrap gap-2">
            {kpis.map((k) => (
              <span
                key={k.key}
                className="inline-flex items-center gap-1.5 rounded-lg border border-rule/60 bg-section px-3 py-1.5 text-[12.5px]"
              >
                <span className="text-muted">{k.label}</span>
                <span className="font-semibold tabular-nums text-navy">
                  {formatIndicator(k.value, k.unit)}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      <WizardNav
        onBack={() => goTo(1)}
        onNext={() => goTo(3)}
        nextLabel="Review variance & MD&A"
      />
    </div>
  )
}

function header() {
  return (
    <header className="mb-5">
      <h2 className="font-serif text-2xl font-semibold text-navy">Confirm the pulled financials</h2>
      <p className="mt-1 text-[13.5px] text-muted">
        These figures come straight from your saved statements and budget — review before you build.
      </p>
    </header>
  )
}

function tile(label, value, tone) {
  const ring =
    tone === 'emerald'
      ? 'border-emerald-200 bg-emerald-50/60'
      : tone === 'rose'
        ? 'border-rose-200 bg-rose-50/60'
        : 'border-gold/30 bg-gold/[0.06]'
  return (
    <div className={`rounded-xl border-2 px-4 py-3.5 ${ring}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">{label}</p>
      <p className="mt-1 font-serif text-[22px] font-semibold tabular-nums text-navy">
        ${money(value)}
      </p>
    </div>
  )
}
