// Phase 3 — period-over-period comparison. The metrics endpoint already carries
// `periodOverPeriodDelta` (current − prior, in the metric's own units), so the
// prior value is exact: prior = value − delta. No new backend. Direction-goodness
// varies by metric, so the change is shown neutrally (arrow + gold), not red/green.
import { motion, useReducedMotion } from 'framer-motion'
import { GitCompareArrows, ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { metricFormat, formatMetricValue, formatDelta } from '../../lib/metricMeta.js'

export default function PeriodComparison({ metrics }) {
  const reduce = useReducedMotion()
  const rows = (metrics ?? []).filter(
    (m) => m.available && m.value != null && m.periodOverPeriodDelta != null,
  )
  if (rows.length === 0) return null

  return (
    <motion.section
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="card-soft p-4 sm:p-5"
    >
      <div className="mb-3 flex items-center gap-2.5">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/15 text-gold">
          <GitCompareArrows size={18} />
        </span>
        <div>
          <h3 className="font-serif text-lg font-semibold text-navy">Period-over-period</h3>
          <p className="text-[12px] text-muted">Each metric this period vs. the prior period.</p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-rule text-[10px] font-semibold uppercase tracking-[0.1em] text-muted">
              <th className="py-2 pr-3 text-left font-semibold">Metric</th>
              <th className="px-3 py-2 text-right font-semibold">Prior</th>
              <th className="px-3 py-2 text-right font-semibold">Current</th>
              <th className="py-2 pl-3 text-right font-semibold">Change</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => {
              const fmt = metricFormat(m.key, m.unit)
              const prior = m.value - m.periodOverPeriodDelta
              const delta = m.periodOverPeriodDelta
              const Arrow = delta > 0 ? ArrowUp : delta < 0 ? ArrowDown : Minus
              return (
                <tr key={m.key} className="border-b border-rule/50 last:border-0">
                  <td className="py-2 pr-3 text-navy">{m.label}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted">
                    {formatMetricValue(prior, fmt)}
                  </td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums text-navy">
                    {formatMetricValue(m.value, fmt)}
                  </td>
                  <td className="py-2 pl-3 text-right">
                    <span
                      className={`inline-flex items-center justify-end gap-1 tabular-nums ${
                        delta === 0 ? 'text-muted' : 'text-gold'
                      }`}
                    >
                      <Arrow size={12} />
                      {formatDelta(delta, fmt) ?? '—'}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </motion.section>
  )
}
