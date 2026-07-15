// ─────────────────────────────────────────────────────────────────────────────
// ChartCard — the frame every analytics-v2 visual lives in (Charts gallery AND
// the Overview bento). Gives the chart the ONE card chrome (`.av2-card`: white,
// rounded-2xl, slate hairline ring, soft ambient shadow — analytics-v2.css), its
// title row + an "as of {periodEnd/FY}" timestamp (trust signal, derived upstream
// from the active period — never invented here), its cross-link anchor (id =
// anchorId, the flash target from a scorecard "chart →"), and its "view as table"
// twin (jumps to the Scorecard and flashes the row for `metricKey`). The chart
// PRIMITIVE is passed as children; the card owns none of the drawing (dataviz
// stays in charts/). Hover lift rides framer's whileHover so it never fights the
// entrance transform. Reduced-motion drops both the enter animation and the lift.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { Table2 } from 'lucide-react'

export default function ChartCard({ id, metricKey, title, sub, asOf, onViewAsTable, delay = 0, className = '', children }) {
  const reduce = useReducedMotion()
  return (
    <motion.div
      id={id}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      whileInView={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.4, delay, ease: 'easeOut' }}
      whileHover={reduce ? undefined : { y: -2 }}
      className={`av2-card flex min-w-0 flex-col p-4 sm:p-5 ${className}`}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0">
          {sub && (
            <p className="mb-0.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-gold">{sub}</p>
          )}
          <h4 className="font-serif text-[16px] font-semibold leading-snug text-navy sm:text-[17px]">
            {title}
          </h4>
        </div>
        <div className="flex shrink-0 items-center gap-2.5">
          {asOf && <span className="whitespace-nowrap text-[11px] font-medium text-slate-400 tabular-nums">{asOf}</span>}
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
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </motion.div>
  )
}
