import { Copy, Minus, CircleSlash, CalendarX, HelpCircle, FileWarning } from 'lucide-react'
import { Pill } from '../../ui/surface/index.js'

const ANOMALY_META = {
  duplicate: { label: 'Duplicate', Icon: Copy, tone: 'watch' },
  negative_amount: { label: 'Negative amount', Icon: Minus, tone: 'risk' },
  zero_amount: { label: 'Zero amount', Icon: CircleSlash, tone: 'watch' },
  date_outside_period: { label: 'Out of period', Icon: CalendarX, tone: 'watch' },
  unknown_program: { label: 'Unknown program', Icon: HelpCircle, tone: 'watch' },
  missing_amount: { label: 'Missing amount', Icon: FileWarning, tone: 'risk' },
}


/** The deterministic anomalies list (duplicates, negatives, out-of-period, etc). */
export default function AnomaliesList({ anomalies }) {
  if (!anomalies || anomalies.length === 0) {
    return (
      <p className="b2-callout b2-good">No anomalies detected in the disbursement set.</p>
    )
  }

  // Group counts for a quick summary row.
  const counts = anomalies.reduce((acc, a) => {
    acc[a.type] = (acc[a.type] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {Object.entries(counts).map(([type, n]) => {
          const meta = ANOMALY_META[type] ?? { label: type, Icon: FileWarning, tone: 'watch' }
          const Icon = meta.Icon
          return (
            <Pill key={type} variant="status" tone={meta.tone}>
              <Icon size={11} aria-hidden="true" /> {meta.label} · {n}
            </Pill>
          )
        })}
      </div>
      <ul className="border-t border-hair">
        {anomalies.map((a, i) => {
          const meta = ANOMALY_META[a.type] ?? { label: a.type, Icon: FileWarning, tone: 'watch' }
          const Icon = meta.Icon
          return (
            <li key={`${a.type}-${a.index ?? 'x'}-${i}`} className="flex items-start gap-3 border-b border-hair py-2.5">
              <i className={`mark tone-${meta.tone} mt-1`} aria-hidden="true" />
              <Icon size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-ink2" />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-ink">
                  {meta.label}
                  {a.index != null && (
                    <span className="ml-1.5 font-normal text-ink2">· row {a.index + 1}</span>
                  )}
                </p>
                <p className="text-[13px] text-ink2">{a.detail}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
