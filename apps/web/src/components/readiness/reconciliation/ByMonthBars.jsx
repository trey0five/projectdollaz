import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { fmtDollar } from '../../../lib/format.js'

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function monthLabel(key) {
  if (key === 'unknown') return 'No date'
  const [yr, mo] = key.split('-')
  return `${MONTH_ABBR[Number(mo) - 1]} ${String(yr).slice(2)}`
}

/** A per-month disbursement bar chart (gold gradient bars, on-theme). */
export default function ByMonthBars({ byMonth }) {
  const reduce = useReducedMotion()
  const max = useMemo(
    () => byMonth.reduce((m, b) => Math.max(m, Math.abs(b.total)), 0),
    [byMonth],
  )

  if (byMonth.length === 0) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-rule/60 bg-section px-4 py-8 text-center text-[12px] italic text-muted">
        No dated disbursements to chart yet.
      </div>
    )
  }

  return (
    <div className="space-y-2.5">
      {byMonth.map((b, i) => {
        const pct = max > 0 ? (Math.abs(b.total) / max) * 100 : 0
        const negative = b.total < 0
        return (
          <div key={b.month} className="flex items-center gap-3 text-[12px]">
            <span className="w-14 shrink-0 font-semibold text-muted">{monthLabel(b.month)}</span>
            <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-section">
              <motion.div
                className={`h-full rounded-md ${negative ? 'bg-danger/70' : 'bg-gold-gradient'}`}
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${Math.max(pct, 2)}%` }}
                transition={{ duration: 0.5, delay: i * 0.05, ease: 'easeOut' }}
              />
            </div>
            <span className="w-28 shrink-0 text-right tabular-nums text-navy">
              {fmtDollar(b.total)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
