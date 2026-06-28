import { Copy, Minus, CircleSlash, CalendarX, HelpCircle, FileWarning } from 'lucide-react'

const ANOMALY_META = {
  duplicate: { label: 'Duplicate', Icon: Copy, tone: 'watch' },
  negative_amount: { label: 'Negative amount', Icon: Minus, tone: 'risk' },
  zero_amount: { label: 'Zero amount', Icon: CircleSlash, tone: 'watch' },
  date_outside_period: { label: 'Out of period', Icon: CalendarX, tone: 'watch' },
  unknown_program: { label: 'Unknown program', Icon: HelpCircle, tone: 'watch' },
  missing_amount: { label: 'Missing amount', Icon: FileWarning, tone: 'risk' },
}

const TONE = {
  watch: 'bg-navy-soft/10 text-navy-soft border-navy-soft/30',
  risk: 'bg-danger/10 text-danger border-danger/30',
}

/** The deterministic anomalies list (duplicates, negatives, out-of-period, etc). */
export default function AnomaliesList({ anomalies }) {
  if (!anomalies || anomalies.length === 0) {
    return (
      <div className="rounded-xl border border-gold/30 bg-gold/5 px-4 py-3 text-[15px] text-[#7a5e00]">
        No anomalies detected in the disbursement set.
      </div>
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
            <span
              key={type}
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[13px] font-semibold ${TONE[meta.tone]}`}
            >
              <Icon size={12} /> {meta.label} · {n}
            </span>
          )
        })}
      </div>
      <ul className="divide-y divide-rule/50 overflow-hidden rounded-xl border border-rule/60">
        {anomalies.map((a, i) => {
          const meta = ANOMALY_META[a.type] ?? { label: a.type, Icon: FileWarning, tone: 'watch' }
          const Icon = meta.Icon
          return (
            <li key={`${a.type}-${a.index ?? 'x'}-${i}`} className="flex items-start gap-3 bg-white px-4 py-2.5">
              <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${TONE[meta.tone]}`}>
                <Icon size={13} />
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-semibold text-navy">
                  {meta.label}
                  {a.index != null && (
                    <span className="ml-1.5 font-normal text-muted">· row {a.index + 1}</span>
                  )}
                </p>
                <p className="text-[14px] text-muted">{a.detail}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
