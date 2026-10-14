import AnimatedMetricValue from './AnimatedMetricValue.jsx'
import PeriodSelector from './PeriodSelector.jsx'
import { metricFormat, formatDelta, deltaTone, isBandedStatus } from '../../lib/metricMeta.js'
import { formatShortDate } from '../../lib/format.js'
import { PageHeader, StatStrip, Stat } from '../ui/surface/index.js'
import { MARK, DELTA_TONE } from './v2/statusStyle.js'

// The hero KPIs shown in the masthead.
const HERO_KEYS = ['operating_margin', 'days_cash_on_hand', 'months_operating_reserve']

/**
 * Masthead (Premium UI P3): a `PageHeader` — eyebrow FINANCIAL INSIGHTS, the
 * period label as the title, the period end as meta, the period selector as the
 * action — over a `StatStrip` of the 2–3 hero KPIs (count-up + delta Pill +
 * 2px status mark). The navy-gradient band is gone (plan §2.1).
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
  const heroes = HERO_KEYS.map((k) => metricsByKey[k]).filter(Boolean)
  return (
    <div>
      <PageHeader
        eyebrow="Financial insights"
        title={periodLabel || 'Latest period'}
        meta={`Period end ${formatShortDate(periodEndDate)}`}
        actions={<PeriodSelector periods={periods} activeId={activePeriodId} onSelect={onSelectPeriod} light />}
      />
      {heroes.length ? (
        <StatStrip cols={heroes.length}>
          {heroes.map((m) => {
            const fmt = metricFormat(m.key, m.unit)
            const deltaText = m.available ? formatDelta(m.periodOverPeriodDelta, fmt) : null
            return (
              <Stat
                key={`${periodKey}-${m.key}`}
                label={m.label}
                value={m.available ? m.value : '—'}
                format={fmt}
                status={m.available && isBandedStatus(m.status) ? MARK[m.status] : undefined}
                delta={deltaText ? { text: deltaText, tone: DELTA_TONE[deltaTone(m.periodOverPeriodDelta, m.goodDirection)] ?? 'neutral' } : null}
              />
            )
          })}
        </StatStrip>
      ) : null}
    </div>
  )
}
