// Budget→Actual bridge (waterfall). Reads as four steps top-to-bottom: the
// budgeted net surplus, the revenue swing, the expense swing, and the resulting
// actual net. Pure CSS/divs (no chart lib) so negatives/deficits position
// naturally on a shared scale and it stays on the navy/gold theme.
import { fmtDollar } from '../../lib/format.js'

const FAV = '#1b7a4b' // favorable (green)
const UNFAV = '#c0392b' // unfavorable (red)

export default function BudgetBridge({ budgetNet, actualNet, revVar, expVar }) {
  const run1 = budgetNet + revVar
  // revVar = actRev − budRev (higher = favorable). expVar = actExp − budExp
  // (higher = unfavorable). run1 − expVar === actualNet, so the bridge reconciles.
  const steps = [
    { label: 'Budgeted net', from: 0, to: budgetNet, color: '#1e2a4a', solid: true },
    {
      label: 'Revenue vs. budget',
      from: budgetNet,
      to: run1,
      color: revVar >= 0 ? FAV : UNFAV,
      delta: revVar,
    },
    {
      label: 'Expenses vs. budget',
      from: run1,
      to: actualNet,
      color: expVar <= 0 ? FAV : UNFAV,
      delta: -expVar,
    },
    { label: 'Actual net', from: 0, to: actualNet, color: '#1e2a4a', solid: true },
  ]

  const bounds = [0, budgetNet, run1, actualNet]
  const min = Math.min(...bounds)
  const max = Math.max(...bounds)
  const range = max - min || 1
  const x = (v) => ((v - min) / range) * 100
  const zero = x(0)

  return (
    <div className="rounded-lg border border-rule/60 bg-white p-3">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.1em] text-gold">
        Budget → actual bridge
      </p>
      <div className="space-y-2">
        {steps.map((s) => {
          const lo = Math.min(s.from, s.to)
          const hi = Math.max(s.from, s.to)
          const left = x(lo)
          const width = Math.max(x(hi) - x(lo), 0.6)
          return (
            <div key={s.label} className="flex items-center gap-2">
              <span className="w-28 shrink-0 text-right text-[11px] text-muted">{s.label}</span>
              <div className="relative h-5 flex-1 rounded bg-section">
                {/* zero baseline */}
                <span
                  className="absolute top-0 h-full w-px bg-rule"
                  style={{ left: `${zero}%` }}
                />
                <span
                  className="absolute top-0.5 h-4 rounded-sm"
                  style={{ left: `${left}%`, width: `${width}%`, backgroundColor: s.color, opacity: s.solid ? 1 : 0.85 }}
                />
              </div>
              <span
                className="w-24 shrink-0 text-right text-[11px] tabular-nums"
                style={{ color: s.solid ? '#1e2a4a' : s.color }}
              >
                {s.solid ? fmtDollar(s.to) : `${s.delta >= 0 ? '+' : '−'}${fmtDollar(Math.abs(s.delta))}`}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
