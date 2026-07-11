// ─────────────────────────────────────────────────────────────────────────────
// ChartCard — the frame every Charts-view visual lives in. Gives the chart its
// title + sub, its cross-link anchor (id = anchorId, the flash target from a
// scorecard "chart →"), and its "view as table" twin (jumps to the Scorecard and
// flashes the row for `metricKey`). The chart PRIMITIVE is passed as children; the
// card owns none of the drawing (dataviz stays in charts/). Reduced-motion drops
// the enter animation.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { Table2 } from 'lucide-react'

export default function ChartCard({ id, metricKey, title, sub, onViewAsTable, children }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      id={id}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      whileInView={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      className="card-soft flex min-w-0 flex-col p-4 sm:p-5"
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-serif text-[15px] font-semibold text-navy sm:text-base">{title}</h4>
          {sub && <p className="mt-0.5 text-[12.5px] text-muted">{sub}</p>}
        </div>
        {metricKey && onViewAsTable && (
          <button
            type="button"
            onClick={() => onViewAsTable(metricKey)}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-rule/60 px-2.5 py-1 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted transition-colors hover:border-gold/60 hover:text-navy focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
          >
            <Table2 size={12} /> View as table
          </button>
        )}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </motion.div>
  )
}
