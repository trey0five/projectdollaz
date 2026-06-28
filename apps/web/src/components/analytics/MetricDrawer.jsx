import { lazy, Suspense, useEffect, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { X } from 'lucide-react'
import { useTrends } from '../../hooks/useAnalytics.js'
import AnimatedMetricValue from './AnimatedMetricValue.jsx'
import DeltaChip from './DeltaChip.jsx'
import StatusChip from './StatusChip.jsx'
import MetricIcon from './MetricIcon.jsx'
import MixDonut from './MixDonut.jsx'
import {
  formatForUnit,
  formatMetricValue,
  metricFormat,
  isBandedStatus,
  isMixMetric,
  statusMeta,
} from '../../lib/metricMeta.js'

const TrendChart = lazy(() => import('./TrendChart.jsx'))

/**
 * Slim segmented target-band bar with a marker at the current value. Only shown
 * for banded metrics. risk / watch / good segments use the status tokens; the
 * marker sits proportionally between a sensible min/max derived from the bands.
 */
function TargetBandBar({ metric }) {
  const bands = metric.bands
  if (!bands || metric.value == null) return null
  const fmt = metricFormat(metric.key, metric.unit)
  const higher = bands.goodDirection === 'higher'
  // Build an axis [lo..hi] padded around the band thresholds + current value.
  const pts = [bands.good, bands.risk, metric.value].filter((n) => n != null)
  const rawLo = Math.min(...pts)
  const rawHi = Math.max(...pts)
  const pad = (rawHi - rawLo) * 0.25 || Math.abs(rawHi) * 0.25 || 1
  const lo = rawLo - pad
  const hi = rawHi + pad
  const pos = (v) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))

  // For 'higher': [lo..risk]=risk, [risk..good]=watch, [good..hi]=good.
  // For 'lower':  [lo..good]=good, [good..risk]=watch, [risk..hi]=risk.
  const segments = higher
    ? [
        { tone: 'risk', from: lo, to: bands.risk },
        { tone: 'watch', from: bands.risk, to: bands.good },
        { tone: 'good', from: bands.good, to: hi },
      ]
    : [
        { tone: 'good', from: lo, to: bands.good },
        { tone: 'watch', from: bands.good, to: bands.risk },
        { tone: 'risk', from: bands.risk, to: hi },
      ]

  return (
    <div className="mt-1">
      <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-section">
        {segments.map((s) => {
          const left = pos(s.from)
          const width = pos(s.to) - left
          if (width <= 0) return null
          return (
            <span
              key={s.tone}
              className={`absolute inset-y-0 ${statusMeta(s.tone).dot} opacity-60`}
              style={{ left: `${left}%`, width: `${width}%` }}
            />
          )
        })}
        {/* current-value marker */}
        <span
          className="absolute -top-0.5 h-3.5 w-[3px] rounded bg-navy-deep shadow"
          style={{ left: `calc(${pos(metric.value)}% - 1.5px)` }}
          aria-hidden
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[12px] text-muted">
        <span>
          {higher
            ? `Risk < ${formatMetricValue(bands.risk, fmt)}`
            : `Good ≤ ${formatMetricValue(bands.good, fmt)}`}
        </span>
        <span className="font-semibold text-navy">Now {formatMetricValue(metric.value, fmt)}</span>
        <span>
          {higher
            ? `Good ≥ ${formatMetricValue(bands.good, fmt)}`
            : `Risk > ${formatMetricValue(bands.risk, fmt)}`}
        </span>
      </div>
    </div>
  )
}

/**
 * Drill-down detail drawer (Phase 4D). Accessible slide-over from the right:
 * header + status chip, big value + PoP delta, target-band marker bar, the
 * FORMULA + description, the named INPUT values (traceability), and the metric's
 * full TrendChart across periods. Esc / backdrop close; focus returns to the
 * opener; reduced-motion → fade only.
 */
export default function MetricDrawer({ schoolId, metric, open, onClose }) {
  const reduce = useReducedMotion()
  const panelRef = useRef(null)
  const metricKey = metric?.key ?? null
  const { trend } = useTrends(open ? schoolId : null, open ? metricKey : null)

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    // Move focus into the panel for accessibility.
    const t = setTimeout(() => panelRef.current?.focus(), 30)
    return () => {
      document.removeEventListener('keydown', onKey)
      clearTimeout(t)
    }
  }, [open, onClose])

  const fmt = metric ? metricFormat(metric.key, metric.unit) : 'ratio'
  const isMix = metric ? isMixMetric(metric.key) : false

  return (
    <AnimatePresence>
      {open && metric && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            className="absolute inset-0 bg-navy-deep/40 backdrop-blur-sm"
            aria-hidden
          />
          {/* panel */}
          <motion.div
            ref={panelRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label={`${metric.label} details`}
            initial={reduce ? { opacity: 0 } : { x: '100%' }}
            animate={reduce ? { opacity: 1 } : { x: 0 }}
            exit={reduce ? { opacity: 0 } : { x: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 34 }}
            className="relative flex h-full w-full max-w-[440px] flex-col overflow-y-auto bg-cream shadow-lift outline-none"
          >
            <div className="flex items-start justify-between gap-3 border-b border-rule/50 bg-white px-5 py-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gold/15 text-gold">
                  <MetricIcon metricKey={metric.key} size={19} />
                </span>
                <div>
                  <h2 className="font-serif text-lg font-semibold text-navy">{metric.label}</h2>
                  {isBandedStatus(metric.status) ? (
                    <div className="mt-1">
                      <StatusChip status={metric.status} />
                    </div>
                  ) : (
                    <p className="mt-0.5 text-[13px] italic text-muted">
                      Contextual — no universal target
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-rule/60 p-1.5 text-muted transition-colors hover:border-gold hover:text-navy"
                aria-label="Close details"
              >
                <X size={16} />
              </button>
            </div>

            <div className="flex flex-col gap-5 px-5 py-5">
              {/* value + delta */}
              {metric.available ? (
                <div>
                  <div className="flex items-end gap-3">
                    <span className="gold-text font-serif text-[44px] font-semibold leading-none">
                      <AnimatedMetricValue value={metric.value} format={fmt} />
                    </span>
                    {isMix && (
                      <span className="pb-1 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">
                        Total
                      </span>
                    )}
                  </div>
                  <div className="mt-2">
                    <DeltaChip
                      delta={metric.periodOverPeriodDelta}
                      format={fmt}
                      goodDirection={metric.goodDirection}
                    />
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-border bg-section px-4 py-3 text-[15px] text-muted">
                  {metric.inputsMissing?.length
                    ? `Unavailable — needs: ${metric.inputsMissing.join(', ')}`
                    : 'Unavailable for this period.'}
                </div>
              )}

              {/* composition breakdown (mix metrics) — the donut + category
                  list IS the story for revenue_mix / expense_mix. */}
              {isMix && metric.available && metric.components && (
                <div>
                  <p className="mb-1.5 font-sans text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
                    Composition
                  </p>
                  <div className="card-soft p-3">
                    <MixDonut metric={metric} />
                  </div>
                </div>
              )}

              {/* target band */}
              {metric.bands && metric.available && (
                <div>
                  <p className="mb-1 font-sans text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
                    Target band
                  </p>
                  <TargetBandBar metric={metric} />
                </div>
              )}

              {/* formula + description */}
              {(metric.formula || metric.description) && (
                <div>
                  <p className="mb-1 font-sans text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
                    How it's calculated
                  </p>
                  {metric.formula && (
                    <p className="rounded-lg border border-rule/50 bg-white px-3 py-2 font-serif text-[16px] text-navy">
                      {metric.formula}
                    </p>
                  )}
                  {metric.description && (
                    <p className="mt-1.5 text-[14.5px] leading-relaxed text-muted">
                      {metric.description}
                    </p>
                  )}
                </div>
              )}

              {/* named inputs */}
              {metric.inputs?.length > 0 && (
                <div>
                  <p className="mb-1.5 font-sans text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
                    Inputs
                  </p>
                  <ul className="divide-y divide-rule/40 overflow-hidden rounded-lg border border-rule/50 bg-white">
                    {metric.inputs.map((inp) => (
                      <li
                        key={inp.key}
                        className="flex items-center justify-between gap-3 px-3 py-2 text-[15px]"
                      >
                        <span className="text-ink">{inp.label}</span>
                        <span
                          className={`font-semibold ${
                            inp.value == null ? 'italic text-danger' : 'text-navy'
                          }`}
                        >
                          {inp.value == null
                            ? 'missing'
                            : formatMetricValue(inp.value, formatForUnit(inp.unit))}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* trend */}
              <div>
                <p className="mb-1.5 font-sans text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">
                  Trend across periods
                </p>
                <div className="card-soft p-3">
                  <Suspense
                    fallback={<div className="h-52 animate-pulse rounded-lg bg-section sm:h-64" />}
                  >
                    <TrendChart trend={trend} />
                  </Suspense>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
