import { useMemo } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { fmtDollar } from '../../../lib/format.js'

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function monthLabel(key) {
  if (key === 'unknown') return 'No date'
  const [yr, mo] = key.split('-')
  return `${MONTH_ABBR[Number(mo) - 1]} ${String(yr).slice(2)}`
}

/** A per-month disbursement bar list (primary-blue bars; a negative month in risk). */
export default function ByMonthBars({ byMonth }) {
  const reduce = useReducedMotion()
  const max = useMemo(
    () => byMonth.reduce((m, b) => Math.max(m, Math.abs(b.total)), 0),
    [byMonth],
  )

  if (byMonth.length === 0) {
    return (
      <div className="flex items-center justify-center border-y border-hair py-6 text-center text-small italic text-ink2">
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
          <div key={b.month} className="flex items-center gap-3 text-[13px]">
            <span className="w-14 shrink-0 font-semibold text-ink2">{monthLabel(b.month)}</span>
            <div className="relative h-3 min-w-0 flex-1">
              <motion.div
                className={`h-full rounded-r-[4px] ${negative ? 'bg-risk' : 'bg-[#2563EB]'}`}
                initial={reduce ? false : { width: 0 }}
                animate={{ width: `${Math.max(pct, 2)}%` }}
                transition={{ duration: 0.5, delay: i * 0.05, ease: 'easeOut' }}
              />
            </div>
            <span className="w-28 shrink-0 text-right font-semibold tabular-nums text-ink">
              {fmtDollar(b.total)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
