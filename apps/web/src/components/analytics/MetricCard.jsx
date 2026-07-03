import { motion, useReducedMotion } from 'framer-motion'
import { Info } from 'lucide-react'
import AnimatedMetricValue from './AnimatedMetricValue.jsx'
import DeltaChip from './DeltaChip.jsx'
import Sparkline from './Sparkline.jsx'
import StatusDot from './StatusDot.jsx'
import MetricIcon from './MetricIcon.jsx'
import { metricFormat, isBandedStatus } from '../../lib/metricMeta.js'

/**
 * Compact metric card (Phase 4D, lighter language): soft hairline card, a status
 * dot (only for banded metrics — contextual ones stay neutral), animated count-up
 * value, goodDirection-colored PoP delta, and a sparkline. The whole card is a
 * button that opens the drill-down drawer. Unavailable metrics show a muted dash.
 */
// Status → soft hover-glow tint (navy/gold on-theme; risk stays a restrained
// crimson wash). Absent/neutral keeps the default gold card glow (backward-compat).
const STATUS_GLOW = {
  good: 'hover:shadow-[0_16px_38px_-12px_rgba(26,39,68,0.24),0_0_22px_-4px_rgba(184,150,80,0.5)]',
  watch: 'hover:shadow-[0_16px_38px_-12px_rgba(26,39,68,0.26),0_0_22px_-4px_rgba(46,80,143,0.42)]',
  risk: 'hover:shadow-[0_16px_38px_-12px_rgba(26,39,68,0.22),0_0_22px_-4px_rgba(139,26,26,0.4)]',
}

export default function MetricCard({
  metric,
  index = 0,
  trendPoints,
  periodKey,
  category,
  onOpen,
}) {
  const reduce = useReducedMotion()
  const fmt = metricFormat(metric.key, metric.unit)
  const unavailable = !metric.available
  const showStatus = !unavailable && isBandedStatus(metric.status)
  // The band's risk boundary — drawn on the trend as the line the value must not
  // cross. Only for banded metrics that carry bands (contextual ones stay clean).
  const threshold =
    showStatus && metric.bands && Number.isFinite(metric.bands.risk)
      ? metric.bands.risk
      : null

  return (
    <motion.button
      type="button"
      // Stable id so Penny's walkthrough can glide to a specific metric (metric-<key>).
      id={`metric-${metric.key}`}
      onClick={() => onOpen?.(metric.key)}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, type: 'spring', stiffness: 260, damping: 22 }}
      whileHover={reduce ? undefined : { y: -3 }}
      className={`card-vital group relative flex w-full flex-col overflow-hidden p-3 text-left transition-shadow duration-300 sm:p-4 ${
        (!unavailable && STATUS_GLOW[metric.status]) || ''
      }`}
      aria-label={`${metric.label} details`}
    >
      {category && (
        <span className="mb-1.5 inline-block max-w-full truncate text-[10px] font-bold uppercase tracking-[0.16em] text-muted/70">
          {category}
        </span>
      )}
      <div className="flex items-start gap-2.5">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-105 ${
            unavailable
              ? 'bg-section text-muted'
              : 'bg-gold-gradient text-white shadow-[0_3px_10px_-2px_rgba(184,150,80,0.55)]'
          }`}
        >
          <MetricIcon metricKey={metric.key} size={17} />
        </span>
        <h3 className="font-sans text-[12.5px] font-semibold uppercase leading-snug tracking-[0.1em] text-muted">
          {metric.label}
        </h3>
        {showStatus && (
          <span className="ml-auto">
            <StatusDot status={metric.status} size={9} />
          </span>
        )}
      </div>

      {unavailable ? (
        <div className="mt-4">
          <div className="font-serif text-2xl font-semibold text-gray-300">—</div>
          <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-border bg-section px-2 py-0.5 text-[12px] font-semibold text-muted">
            <Info size={10} /> Unavailable
          </span>
        </div>
      ) : (
        <>
          <div className="mt-3.5 flex items-end gap-2">
            <span className="gold-text font-serif text-[22px] font-semibold leading-none sm:text-[28px]">
              <AnimatedMetricValue key={periodKey} value={metric.value} format={fmt} />
            </span>
          </div>
          <div className="mt-2 min-h-[22px]">
            <DeltaChip
              delta={metric.periodOverPeriodDelta}
              format={fmt}
              goodDirection={metric.goodDirection}
            />
          </div>
          {/* Full-bleed status trend: the graph is a real presence at the card
              foot (bleeds to the rounded edges via the card's overflow-hidden),
              colored to the band with the risk threshold drawn on it. */}
          <div className="-mx-3 -mb-3 mt-3 sm:-mx-4 sm:-mb-4">
            <Sparkline
              points={trendPoints}
              status={metric.status}
              threshold={threshold}
              height={56}
            />
          </div>
        </>
      )}
    </motion.button>
  )
}
