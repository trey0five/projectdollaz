// Saved-periods rail for the merged Statements & Periods page. Lists the school's
// saved periods (newest-first). The NEWEST/active period is the live editable
// workspace; selecting any OTHER saved period opens its stored snapshot read-only.
// Mirrors the prior HistoryPanel selection model exactly — no new hydration path.
import { motion } from 'framer-motion'
import { FileCheck2, FileX2, ChevronRight, Loader2, Sparkles } from 'lucide-react'
import { formatShortDate } from '../../lib/format.js'

export default function SavedPeriodsRail({
  periods,
  activePeriodId,
  selectedId,
  loadingId,
  onSelect,
}) {
  if (!periods || periods.length === 0) return null

  return (
    <div className="space-y-2 sm:space-y-2.5">
      {periods.map((p, i) => {
        const isLive = p.id === activePeriodId
        const isSelected = p.id === selectedId
        return (
          <motion.button
            key={p.id}
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i * 0.04, 0.3) }}
            onClick={() => onSelect(p)}
            disabled={!isLive && !p.hasSnapshot}
            className={`flex w-full items-center justify-between gap-3 rounded-xl border bg-white px-3.5 py-2.5 text-left shadow-card transition-all sm:border-2 sm:px-4 sm:py-3 ${
              isSelected
                ? 'border-gold shadow-glow'
                : isLive || p.hasSnapshot
                  ? 'cursor-pointer border-border hover:border-gold hover:shadow-glow'
                  : 'cursor-not-allowed border-border opacity-70'
            }`}
            aria-current={isSelected ? 'true' : undefined}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-serif text-[14px] font-semibold text-navy sm:text-[15px]">{p.label}</span>
                {isLive ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-[#7a5e00]">
                    <Sparkles size={11} /> Live
                  </span>
                ) : p.hasSnapshot ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                    <FileCheck2 size={11} /> Saved
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-section px-2 py-0.5 text-[10px] font-semibold text-muted">
                    <FileX2 size={11} /> No snapshot
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[12px] text-muted">
                Ends {formatShortDate(p.periodEndDate)} ·{' '}
                {['cy', 'py', 'audit']
                  .filter((r) => p.roles?.[r])
                  .map((r) => r.toUpperCase())
                  .join(' · ') || 'no imports'}
              </p>
            </div>
            <div className="flex shrink-0 items-center">
              {loadingId === p.id ? (
                <Loader2 size={17} className="animate-spin text-gold" />
              ) : (
                (isLive || p.hasSnapshot) && (
                  <ChevronRight
                    size={17}
                    className={isSelected ? 'text-gold' : 'text-muted'}
                  />
                )
              )}
            </div>
          </motion.button>
        )
      })}
    </div>
  )
}
