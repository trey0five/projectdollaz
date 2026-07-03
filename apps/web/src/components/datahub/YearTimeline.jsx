import { AnimatePresence, motion } from 'framer-motion'
import { buildTimeline } from '../../lib/trendIntake.js'
import YearChip from './YearChip.jsx'

/**
 * Horizontal fiscal-year axis for the bulk uploader. One YearChip per detected
 * annual candidate, with dashed "gap" chips for missing years in the run so the
 * user sees exactly where their trend has holes. Scrolls horizontally on narrow
 * screens (the page body never scrolls sideways).
 */
export default function YearTimeline({ annual, canEdit, onSetEndDate, onRemove }) {
  const items = buildTimeline(annual)
  const currentYear = new Date().getFullYear()

  return (
    <div className="relative">
      {/* the connecting rail behind the chips */}
      <div className="pointer-events-none absolute left-0 right-0 top-1/2 h-px -translate-y-1/2 bg-gradient-to-r from-transparent via-gold/30 to-transparent" />
      <div className="relative flex items-stretch gap-3 overflow-x-auto pb-2">
        <AnimatePresence initial={false}>
          {items.map((it) =>
            it.gap ? (
              <motion.div
                key={`gap-${it.year}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex w-[92px] shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed border-border/70 bg-section px-2 py-6 text-center"
              >
                <span className="font-serif text-base font-semibold text-muted">FY{it.year}</span>
                <span className="text-[11px] uppercase tracking-[0.08em] text-muted">Missing</span>
              </motion.div>
            ) : (
              <YearChip
                key={it.candidate.key}
                candidate={it.candidate}
                canEdit={canEdit}
                currentYear={currentYear}
                onSetEndDate={onSetEndDate}
                onRemove={onRemove}
              />
            ),
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
