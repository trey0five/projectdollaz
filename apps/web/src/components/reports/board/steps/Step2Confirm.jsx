// Step 2 — Confirm pulled financials (the empty-state gate). Reads availability
// from the assembled bundle (the web does NO math):
//   (a) !hasSnapshot          -> guidance card + link to /statements, Next disabled
//   (b) hasSnapshot,!hasBudget -> soft warning (variance shows Actual only), Next ON
//   (c) all present            -> "ready as of {dataAsOf}" + revenue/expense/surplus
//                                 StatStrip + ruled KPI lines, read-only confirmation.
import { Link } from 'react-router-dom'
import { CheckCircle2, AlertTriangle, FileX2, TrendingUp } from 'lucide-react'
import { formatIndicator, dateTime } from '../boardReportUtils.js'
import WizardNav from './WizardNav.jsx'
import { StatStrip, Stat } from '../../../ui/surface/index.js'
import { statMoney, signedMoney } from '../../../budget/StatFigure.jsx'

export default function Step2Confirm({ ctx }) {
  const { data, goTo, loading } = ctx

  if (loading || !data) {
    return (
      <p className="py-10 text-center text-[14px] text-ink2">Assembling this period&apos;s financials…</p>
    )
  }

  const av = data.availability || {}

  // (a) No snapshot — block, route to statements.
  if (!av.hasSnapshot) {
    return (
      <div>
        {header()}
        <div className="b2-callout b2-watch flex-col !gap-1 py-3">
          <div className="flex items-center gap-2">
            <FileX2 size={18} aria-hidden="true" className="text-ink2" />
            <h3 className="text-heading font-semibold text-ink">No statements for this period yet</h3>
          </div>
          <p className="text-small text-ink2">
            The board report builds from a generated statement snapshot. Generate statements for{' '}
            <strong className="text-ink">{data.label}</strong> first, then return here.
          </p>
          <Link to="/statements" className="btn btn-secondary btn-sm mt-2 self-start">
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

      <p className="b2-callout b2-good mb-4 font-semibold">
        <CheckCircle2 size={14} aria-hidden="true" />
        Financials ready{av.dataAsOf ? ` as of ${dateTime(av.dataAsOf)}` : ''}
      </p>

      {!av.hasBudget && (
        <div className="b2-callout b2-watch mb-4">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>
            No budget set for this period — variance columns will show <strong>actuals only</strong>.{' '}
            <Link to="/budget" className="font-semibold underline decoration-hair underline-offset-2 hover:decoration-ink">
              Add a budget
            </Link>{' '}
            for full budget-vs-actual.
          </span>
        </div>
      )}

      <StatStrip cols={3} className="stats-compact border-t border-hair">
        <Stat label="Total revenue" value={statMoney(rev?.actual)} />
        <Stat label="Total expenses" value={statMoney(exp?.actual)} />
        <Stat
          label="Net surplus / (deficit)"
          value={signedMoney(net?.actual)}
          status={!net?.actual ? 'neutral' : net.actual < 0 ? 'risk' : 'good'}
        />
      </StatStrip>

      {kpis.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2">
            <TrendingUp size={13} /> Key indicators
          </p>
          <div className="sec-cols">
            {kpis.map((k) => (
              <div key={k.key} className="fig">
                <span className="fig-label">{k.label}</span>
                <span className="fig-value">{formatIndicator(k.value, k.unit)}</span>
              </div>
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
      <h2 className="font-serif text-title font-medium text-ink">Confirm the pulled financials</h2>
      <p className="mt-1 text-[13.5px] text-ink2">
        These figures come straight from your saved statements and budget — review before you build.
      </p>
    </header>
  )
}
