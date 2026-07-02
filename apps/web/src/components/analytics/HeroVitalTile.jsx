import { motion, useReducedMotion } from 'framer-motion'
import AnimatedMetricValue from './AnimatedMetricValue.jsx'
import DeltaChip from './DeltaChip.jsx'
import Sparkline from './Sparkline.jsx'
import StatusChip from './StatusChip.jsx'
import StatusDot from './StatusDot.jsx'
import MetricIcon from './MetricIcon.jsx'
import { metricFormat } from '../../lib/metricMeta.js'

/**
 * A large "vital sign" hero tile (Phase 4D): status-colored left accent rail,
 * big count-up value, delta, status chip, and a mini multi-period trend. Clicking
 * opens the drill-down drawer. Soft card (hairline + shadow, NOT border-2).
 */
export default function HeroVitalTile({ metric, index = 0, trend, periodKey, onOpen }) {
  const reduce = useReducedMotion()
  const fmt = metricFormat(metric.key, metric.unit)
  const unavailable = !metric.available
  const points = trend?.points
  const banded = !unavailable && metric.status && metric.status !== 'neutral'
  const threshold =
    banded && metric.bands && Number.isFinite(metric.bands.risk) ? metric.bands.risk : null

  return (
    <motion.button
      type="button"
      // Stable id so Penny's walkthrough can glide to a specific metric (metric-<key>).
      id={`metric-${metric.key}`}
      onClick={() => onOpen?.(metric.key)}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06, type: 'spring', stiffness: 240, damping: 22 }}
      whileHover={reduce ? undefined : { y: -4 }}
      className="card-vital group relative flex w-full flex-col overflow-hidden p-4 text-left sm:p-5"
      aria-label={`${metric.label} details`}
    >
      {/* Row 1: icon + status (chip on sm+, dot on mobile). Severity now reads from
          the status chip/dot + the status-colored trend below — no left rail. */}
      <div className="flex items-center justify-between gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold/15 text-gold sm:h-10 sm:w-10">
          <MetricIcon metricKey={metric.key} size={18} />
        </span>
        {!unavailable && (
          <>
            <span className="hidden shrink-0 sm:block">
              <StatusChip status={metric.status} />
            </span>
            <span className="shrink-0 sm:hidden">
              <StatusDot status={metric.status} size={11} />
            </span>
          </>
        )}
      </div>

      {/* Row 2: full-width title (never squeezed by the chip). */}
      <h3 className="mt-2.5 line-clamp-2 font-sans text-[13px] font-semibold uppercase leading-snug tracking-[0.1em] text-muted">
        {metric.label}
      </h3>

      {unavailable ? (
        <div className="mt-5">
          <div className="font-serif text-4xl font-semibold text-gray-300">—</div>
          <p className="mt-2 text-[13px] italic text-muted">
            {metric.inputsMissing?.length
              ? `Needs: ${metric.inputsMissing.join(', ')}`
              : 'Not enough data for this period.'}
          </p>
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-end gap-3 sm:mt-4">
            <span className="gold-text font-serif text-[30px] font-semibold leading-none sm:text-[40px]">
              <AnimatedMetricValue key={periodKey} value={metric.value} format={fmt} />
            </span>
          </div>
          <div className="mt-2 min-h-[22px] sm:mt-2.5 sm:min-h-[24px]">
            <DeltaChip
              delta={metric.periodOverPeriodDelta}
              format={fmt}
              goodDirection={metric.goodDirection}
            />
          </div>
          {/* Full-bleed status trend at the tile foot (bleeds to the rounded edges),
              band-colored with the risk threshold drawn on it. */}
          <div className="-mx-4 -mb-4 mt-4 sm:-mx-5 sm:-mb-5">
            <Sparkline points={points} status={metric.status} threshold={threshold} height={64} />
          </div>
        </>
      )}
    </motion.button>
  )
}
