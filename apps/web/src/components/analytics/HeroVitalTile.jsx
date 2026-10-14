import { explainUnusableInput } from '@finrep/analytics'
import AnimatedMetricValue from './AnimatedMetricValue.jsx'
import Sparkline from './Sparkline.jsx'
import { Pill } from '../ui/surface/index.js'
import { MARK, DELTA_TONE } from './v2/statusStyle.js'
import { metricFormat, formatDelta, deltaTone, isBandedStatus } from '../../lib/metricMeta.js'

/**
 * A "vital sign" hero Stat (Premium UI P3): label / big count-up value / a 2px
 * status mark / the period-over-period delta as a status Pill / the mini
 * multi-period trend. The whole stat is a button that opens the drill-down
 * drawer — no card, the StatStrip draws the rules. Keeps id=`metric-<key>` so
 * Penny's walkthrough can glide to a specific metric.
 */

export default function HeroVitalTile({ metric, periodKey, trend, onOpen, compact = false, category = null }) {
  const fmt = metricFormat(metric.key, metric.unit)
  const unavailable = !metric.available
  const points = trend?.points
  const banded = !unavailable && isBandedStatus(metric.status)
  const threshold = banded && metric.bands && Number.isFinite(metric.bands.risk) ? metric.bands.risk : null
  const deltaText = unavailable ? null : formatDelta(metric.periodOverPeriodDelta, fmt)

  return (
    <button
      type="button"
      // Stable id so Penny's walkthrough can glide to a specific metric (metric-<key>).
      id={`metric-${metric.key}`}
      onClick={() => onOpen?.(metric.key)}
      className={`stat stat-link w-full text-left${compact ? ' stat-compact' : ''}`}
      aria-label={`${metric.label} details`}
    >
      {category ? <p className="stat-label !text-[10px] text-ink2/70">{category}</p> : null}
      <p className="stat-label">{metric.label}</p>
      {unavailable ? (
        <>
          <span className="stat-value num text-ink2">—</span>
          <span className="mt-1 block text-small italic text-ink2">
            {/* A namespaced token means the input IS present and unusable, so
                "Needs: …" is wrong twice — it prints an internal token and asks
                for something already supplied. The sentence is the semantic
                layer's, not this component's. */}
            {metric.inputsMissing?.length
              ? (metric.inputsMissing.map(explainUnusableInput).find(Boolean) ??
                `Needs: ${metric.inputsMissing.join(', ')}`)
              : 'Not enough data for this period.'}
          </span>
        </>
      ) : (
        <>
          <span className="stat-value num">
            <AnimatedMetricValue key={periodKey} value={metric.value} format={fmt} />
          </span>
          {banded ? <span className={`stat-mark tone-${MARK[metric.status]}`} aria-hidden="true" /> : null}
          {deltaText ? (
            <div className="stat-foot">
              <Pill variant="status" tone={DELTA_TONE[deltaTone(metric.periodOverPeriodDelta, metric.goodDirection)] ?? 'neutral'} title="Change vs the prior period">
                {deltaText}
              </Pill>
            </div>
          ) : null}
          {points?.length >= 2 ? (
            <div className="mt-2">
              <Sparkline points={points} status={metric.status} threshold={threshold} height={compact ? 36 : 48} />
            </div>
          ) : null}
        </>
      )}
    </button>
  )
}
