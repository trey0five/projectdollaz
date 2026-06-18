import { useReducedMotion } from 'framer-motion'
import { CalendarDays, Clock, SlidersHorizontal } from 'lucide-react'
import PeriodSelector from './PeriodSelector.jsx'
import { formatShortDate, formatRelative } from '../../lib/format.js'

/**
 * Sticky context / freshness bar (Phase 4D). Period switching + "Data as of
 * [snapshot date]" + "Updated N ago" + a subtle live pill, on a soft cream/white
 * backdrop hairline card. Owner-only customize entry lives here so the page header
 * stays slim. formatRelative reads Date.now() once per render (no clock loop).
 */
export default function ContextBar({
  periods,
  activePeriodId,
  onSelectPeriod,
  freshness,
  canCustomize,
  customizing,
  onCustomize,
}) {
  const reduce = useReducedMotion()
  const dataAsOf = freshness?.dataAsOf
  const relative = formatRelative(dataAsOf)

  return (
    <div className="card-soft sticky top-2 z-20 mb-5 flex flex-col gap-3 bg-white/95 px-4 py-3 backdrop-blur lg:flex-row lg:items-center lg:justify-between">
      <PeriodSelector
        periods={periods}
        activeId={activePeriodId}
        onSelect={onSelectPeriod}
        light
      />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {dataAsOf && (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
            <CalendarDays size={13} className="text-gold" />
            Data as of{' '}
            <span className="font-semibold text-navy">
              {formatShortDate(dataAsOf.slice(0, 10))}
            </span>
          </span>
        )}
        {relative && (
          <span className="inline-flex items-center gap-1.5 text-[12px] text-muted">
            <Clock size={13} className="text-gold" />
            Updated <span className="font-semibold text-navy">{relative}</span>
          </span>
        )}
        <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#7a5e00]">
          <span
            className={`relative flex h-2 w-2 ${reduce ? '' : 'animate-pulse-ring'} rounded-full bg-gold`}
            aria-hidden
          />
          Live
        </span>

        {canCustomize && !customizing && (
          <button
            type="button"
            onClick={onCustomize}
            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-rule/60 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted transition-colors hover:border-gold hover:text-navy"
          >
            <SlidersHorizontal size={13} /> Customize
          </button>
        )}
      </div>
    </div>
  )
}
