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
export default function MetricCard({
  metric,
  index = 0,
  trendPoints,
  periodKey,
  onOpen,
}) {
  const reduce = useReducedMotion()
  const fmt = metricFormat(metric.key, metric.unit)
  const unavailable = !metric.available
  const showStatus = !unavailable && isBandedStatus(metric.status)

  return (
    <motion.button
      type="button"
      onClick={() => onOpen?.(metric.key)}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, type: 'spring', stiffness: 260, damping: 22 }}
      whileHover={reduce ? undefined : { y: -3 }}
      className="card-vital group relative flex w-full flex-col overflow-hidden p-3 text-left sm:p-4"
      aria-label={`${metric.label} details`}
    >
      <div className="flex items-start gap-2.5">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
            unavailable ? 'bg-section text-muted' : 'bg-gold/15 text-gold'
          }`}
        >
          <MetricIcon metricKey={metric.key} size={17} />
        </span>
        <h3 className="line-clamp-2 font-sans text-[10.5px] font-semibold uppercase leading-snug tracking-[0.1em] text-muted">
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
          <span className="mt-2 inline-flex items-center gap-1 rounded-full border border-border bg-section px-2 py-0.5 text-[10px] font-semibold text-muted">
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
          <div className="mt-3 border-t border-rule/50 pt-2.5">
            <Sparkline points={trendPoints} />
          </div>
        </>
      )}
    </motion.button>
  )
}
