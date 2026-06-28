// ─────────────────────────────────────────────────────────────────────────────
// Phase 2C — the readiness progress rollup. A gold-gradient progress bar whose
// width tracks pctComplete (done + na resolved) and whose DONE segment is shown
// distinctly so marking everything "n/a" cannot masquerade as fully prepared.
// done/na/pending count chips reuse the health palette; the headline reports
// "X resolved / Y" with the done count called out. Animates the bar width
// (reduce -> instant).
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { CheckCircle2, MinusCircle, Circle } from 'lucide-react'
import StatusDot from '../../analytics/StatusDot.jsx'
import { statusMeta } from '../../../lib/metricMeta.js'

function Chip({ palette, icon, label, count }) {
  const m = statusMeta(palette)
  const Icon = icon
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[14px] font-semibold ${m.chip}`}
    >
      <Icon size={13} />
      <span className="tabular-nums">{count}</span>
      <span className="opacity-80">{label}</span>
    </span>
  )
}

export default function ChecklistProgress({ rollup }) {
  const reduce = useReducedMotion()
  if (!rollup) return null
  const { total, done, na, pending, pctComplete } = rollup
  const donePct = total > 0 ? (done / total) * 100 : 0
  const naPct = total > 0 ? (na / total) * 100 : 0

  return (
    <div className="card-flashy p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.14em] text-muted">
            Readiness progress
          </p>
          <p className="mt-1 font-serif text-2xl font-semibold text-navy tabular-nums">
            {done + na} <span className="text-muted">/ {total} resolved</span>
          </p>
          <p className="mt-0.5 text-[14px] text-muted tabular-nums">
            {done} marked done{na > 0 ? ` · ${na} not applicable` : ''}
          </p>
        </div>
        <div className="text-right">
          <span className="gold-text font-serif text-3xl font-semibold tabular-nums">
            {pctComplete}%
          </span>
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">
            resolved
          </p>
        </div>
      </div>

      {/* Stacked bar: gold = done, muted = n/a. Together they fill pctComplete. */}
      <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full bg-navy/[0.06]">
        <motion.div
          className="h-full bg-gold-gradient"
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${donePct}%` }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 20 }}
        />
        <motion.div
          className="h-full bg-navy/25"
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${naPct}%` }}
          transition={reduce ? { duration: 0 } : { type: 'spring', stiffness: 120, damping: 22 }}
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Chip palette="good" icon={CheckCircle2} label="Done" count={done} />
        <Chip palette="neutral" icon={MinusCircle} label="N/A" count={na} />
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-section px-3 py-1 text-[14px] font-semibold text-muted">
          <Circle size={13} />
          <StatusDot status="neutral" size={6} />
          <span className="tabular-nums">{pending}</span>
          <span className="opacity-80">Pending</span>
        </span>
      </div>
    </div>
  )
}
