// Recent saved-periods quick-access strip for the home command center. Shows the
// most recent saved periods (newest-first); clicking a chip deep-links into the
// Statements & Periods page with that period preselected (?period=<id>). On-theme
// card-soft chips with gold accents; horizontal scroll on mobile.
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { FileClock, ChevronRight } from 'lucide-react'
import { formatShortDate } from '../../lib/format.js'

export default function RecentPeriods({ periods }) {
  const reduce = useReducedMotion()
  const recent = (periods || []).filter((p) => p.hasSnapshot).slice(0, 5)
  if (recent.length === 0) return null

  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-serif text-lg font-semibold text-navy">
          <FileClock size={18} className="text-gold" /> Recent periods
        </h2>
        <Link
          to="/statements"
          className="inline-flex items-center gap-1 text-[14px] font-semibold uppercase tracking-[0.06em] text-muted transition-colors hover:text-gold"
        >
          View all <ChevronRight size={14} />
        </Link>
      </div>
      <div className="scrollbar-none -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
        {recent.map((p, i) => (
          <motion.div
            key={p.id}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            whileHover={reduce ? undefined : { y: -3 }}
            className="shrink-0"
          >
            <Link
              to={`/statements?period=${encodeURIComponent(p.id)}`}
              className="card-flashy flex w-[180px] flex-col gap-1 p-4 outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
            >
              <span className="font-serif text-[16px] font-semibold text-navy">{p.label}</span>
              <span className="text-[14px] text-muted">Ends {formatShortDate(p.periodEndDate)}</span>
              <span className="mt-1.5 inline-flex items-center gap-1 text-[13px] font-semibold uppercase tracking-[0.06em] text-gold">
                Open <ChevronRight size={13} />
              </span>
            </Link>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
