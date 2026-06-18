import { useReducedMotion } from 'framer-motion'
import AnimatedMetricValue from './AnimatedMetricValue.jsx'
import DeltaChip from './DeltaChip.jsx'
import PeriodSelector from './PeriodSelector.jsx'
import { metricFormat } from '../../lib/metricMeta.js'
import { formatShortDate } from '../../lib/format.js'

// The hero KPIs shown in the masthead.
const HERO_KEYS = ['operating_margin', 'days_cash_on_hand', 'months_operating_reserve']

/**
 * Premium navy-gradient masthead: active period label + 2-3 hero KPIs in
 * gold-text serif with count-up + delta chips, and the period selector top-right.
 * Slow gradient-pan + radial overlay so it feels alive (reduced-motion-gated).
 */
export default function HeadlineBand({
  periodLabel,
  periodEndDate,
  periodKey,
  metricsByKey,
  periods,
  activePeriodId,
  onSelectPeriod,
}) {
  const reduce = useReducedMotion()
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border-b-2 border-gold/30 bg-navy-gradient p-6 shadow-navy-glow sm:p-8 ${
        reduce ? '' : 'animate-gradient-pan'
      }`}
      style={{ backgroundSize: '200% 200%' }}
    >
      <div className="pointer-events-none absolute inset-0 bg-navy-radial" />
      <div className="relative flex flex-col gap-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-sans text-[11px] font-semibold uppercase tracking-[0.18em] text-gold/80">
              Financial Insights
            </p>
            <h2 className="mt-1 font-serif text-2xl font-semibold text-gold-light sm:text-[28px]">
              {periodLabel || 'Latest period'}
            </h2>
            <p className="mt-0.5 text-[13px] text-white/60">
              Period end {formatShortDate(periodEndDate)}
            </p>
          </div>
          <PeriodSelector
            periods={periods}
            activeId={activePeriodId}
            onSelect={onSelectPeriod}
          />
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {HERO_KEYS.map((k) => {
            const m = metricsByKey[k]
            if (!m) return null
            const fmt = metricFormat(m.key, m.unit)
            return (
              <div key={k} className="rounded-xl bg-white/5 px-4 py-3.5 backdrop-blur-sm">
                <p className="font-sans text-[10px] font-semibold uppercase tracking-[0.12em] text-white/50">
                  {m.label}
                </p>
                <div className="mt-1.5 flex items-end gap-2">
                  <span className="gold-text font-serif text-[30px] font-semibold leading-none">
                    {m.available ? (
                      <AnimatedMetricValue key={`${periodKey}-${k}`} value={m.value} format={fmt} />
                    ) : (
                      <span className="text-white/30">—</span>
                    )}
                  </span>
                </div>
                <div className="mt-2 min-h-[22px]">
                  {m.available && (
                    <DeltaChip
                      delta={m.periodOverPeriodDelta}
                      format={fmt}
                      goodDirection={m.goodDirection}
                      onDark
                    />
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
