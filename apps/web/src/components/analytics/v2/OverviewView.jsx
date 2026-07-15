// ─────────────────────────────────────────────────────────────────────────────
// OverviewView — the 30-second story for each scope, now speaking the HOME's
// visual language. School: the 4 KPI tiles live ON a navy-gradient HERO BAND
// (the BriefingBand's sibling — same gradient/shadow/hairline idiom) as
// V2StatTiles (count-up + delta chip + status glow + area sparkline), then a
// LIGHT ASYMMETRIC BENTO below: revenue-mix donut (1/3) beside the days-cash
// gradient-area trend (2/3), then the "what changed" callouts. Compare: the
// liquidity leader/laggard tiles on the same hero + the multi-school days-cash
// trend. Org (all schools): 4 system KPI tiles on the hero + the per-school
// revenue bar list. Values are the SAME @finrep/analytics-formatted strings the
// Scorecard prints (value parity); the motion gallery still lives in Charts.
//
// Each scope is its OWN component so hooks stay unconditional across scope
// switches. Entrances are staggered fade-ups (once); reduced-motion → opacity.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { TrendingDown, TrendingUp } from 'lucide-react'
import { formatMetricValue, deltaTone } from '../../../lib/metricMeta.js'
import { schoolColor } from './chartPalette.js'
import LineChart from '../charts/LineChart.jsx'
import BarList from '../charts/BarList.jsx'
import FancyDonut from '../charts/FancyDonut.jsx'
import Legend from '../charts/Legend.jsx'
import ChartCard from './ChartCard.jsx'
import V2StatTile from './V2StatTile.jsx'
import { lightStatus } from './statusStyle.js'
import { formatMetric, formatMetricDeltaOf, foldMixComponents } from './helpers.js'

const SCHOOL_KPI_KEYS = ['operating_margin', 'days_cash_on_hand', 'months_operating_reserve', 'tuition_dependency']

const money = (v) => formatMetricValue(v, 'currency')

/** The navy hero band the KPI tiles sit on — the home BriefingBand's sibling. */
function HeroBand({ eyebrow, asOf, children }) {
  const reduce = useReducedMotion()
  return (
    <motion.section
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      aria-label={eyebrow}
      className="relative overflow-hidden rounded-2xl bg-navy-gradient p-5 shadow-navy-glow sm:p-6"
    >
      {/* Quiet decorative glow — static, cheap, reduced-motion safe. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gold/10 blur-3xl"
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: 'linear-gradient(90deg, transparent, rgba(214,178,92,0.5), transparent)' }}
      />
      <div className="relative">
        <div className="mb-4 flex items-baseline justify-between gap-3">
          <span className="text-[12px] font-bold uppercase tracking-[0.18em] text-gold/80">{eyebrow}</span>
          {asOf && <span className="text-[11.5px] font-medium text-white/50 tabular-nums">{asOf}</span>}
        </div>
        {children}
      </div>
    </motion.section>
  )
}

function Callout({ metric, index = 0 }) {
  const reduce = useReducedMotion()
  const delta = formatMetricDeltaOf(metric)
  const up = (metric.periodOverPeriodDelta ?? 0) >= 0
  const tone = deltaTone(metric.periodOverPeriodDelta, metric.goodDirection)
  const toneText = tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-red-600' : 'text-muted'
  const iconChip =
    tone === 'bad' ? 'bg-red-500/10 text-red-600' : tone === 'good' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-slate-100 text-slate-500'
  return (
    <motion.div
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 10 }}
      whileInView={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-30px' }}
      transition={{ duration: 0.35, delay: index * 0.06, ease: 'easeOut' }}
      className="av2-card flex items-center gap-3 p-3.5"
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${iconChip}`}>
        {up ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
      </span>
      <div className="min-w-0">
        <p className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-navy">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 shrink-0 rounded-full"
            style={{ background: lightStatus(metric.status).dot }}
          />
          {metric.label}
        </p>
        <p className="text-[12.5px] text-muted">
          Now <b className="text-navy tabular-nums">{formatMetric(metric)}</b>
          {delta && <span className={`ml-1 font-semibold tabular-nums ${toneText}`}>({delta})</span>}
        </p>
      </div>
    </motion.div>
  )
}

/** Composition as a BAR LIST (the dataviz "magnitude" form) with the total as a
    headline. School revenue is heavily skewed (tuition ≈ 87%), which turns a
    donut into one fat ring with crumbs — bars keep every category readable.
    Segments are folded to ≤6 with a DEEMPH "Other" (foldMixComponents), so hues
    never cycle past the fixed slots. */
function MixBars({ metric, sub = 'Total revenue' }) {
  const parts = metric?.components?.length ? foldMixComponents(metric.components) : null
  if (!parts) return <p className="py-8 text-center text-[13px] italic text-muted">Revenue mix not available.</p>
  const total = parts.reduce((a, p) => a + (Number.isFinite(p.value) ? p.value : 0), 0)
  return (
    <FancyDonut
      parts={parts.map((p) => ({
        label: p.label,
        value: p.value,
        color: p.color,
        formatted: money(p.value),
        share: total > 0 ? `${((p.value / total) * 100).toFixed(0)}%` : undefined,
        deemph: p.other,
      }))}
      centerTotal={formatMetric(metric)}
      centerSub={sub}
      formatter={money}
    />
  )
}

// Build a LineChart series set from per-school trend fan-out for one metric.
function trendSeries(schools, bySchool) {
  const series = []
  let labels = []
  for (const s of schools) {
    const t = bySchool[s.schoolId]
    if (!t?.points?.length) continue
    if (t.points.length > labels.length) labels = t.points.map((p) => p.label)
    series.push({
      id: s.schoolName,
      label: s.schoolName,
      color: schoolColor(s.seriesIndex ?? 0),
      vals: t.points.map((p) => p.value ?? 0),
    })
  }
  return { series, labels }
}

function SchoolOverview({ school }) {
  const m = school.metricsByKey
  const cashTrend = school.sparkTrends?.days_cash_on_hand
  const callouts = useMemo(
    () =>
      (school.metrics || [])
        .filter((x) => x.available && x.periodOverPeriodDelta != null && x.status && x.status !== 'neutral')
        .sort((a, b) => Math.abs(b.periodOverPeriodDelta) - Math.abs(a.periodOverPeriodDelta))
        .slice(0, 3),
    [school.metrics],
  )
  const kpis = SCHOOL_KPI_KEYS.filter((k) => m[k])
  return (
    <div className="space-y-6">
      <HeroBand eyebrow="School vitals" asOf={school.asOf}>
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((k, i) => {
            const metric = m[k]
            return (
              <V2StatTile
                key={k}
                index={i}
                label={metric.label}
                value={formatMetric(metric)}
                delta={metric.periodOverPeriodDelta}
                deltaText={formatMetricDeltaOf(metric)}
                deltaTone={deltaTone(metric.periodOverPeriodDelta, metric.goodDirection)}
                status={metric.status}
                sparkVals={(school.sparkTrends?.[k]?.points ?? []).map((p) => p.value)}
              />
            )
          })}
        </div>
      </HeroBand>

      {/* Asymmetric bento: donut 1/3 · days-cash gradient area 2/3. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <ChartCard title="Where the money comes from" sub="Revenue mix" asOf={school.asOf} delay={0.06}>
          <MixBars metric={m.revenue_mix} />
        </ChartCard>
        <ChartCard title="Days cash on hand" sub="Liquidity across your saved periods" asOf={school.asOf} delay={0.12} className="lg:col-span-2">
          {cashTrend?.points?.length >= 2 ? (
            <LineChart
              series={[{ id: 'cash', label: 'Days cash', color: schoolColor(0), vals: cashTrend.points.map((p) => p.value ?? 0) }]}
              labels={cashTrend.points.map((p) => p.label)}
              area
              formatter={(v) => Math.round(v).toLocaleString()}
            />
          ) : (
            <p className="py-8 text-center text-[13px] italic text-muted">Not enough history yet.</p>
          )}
        </ChartCard>
      </div>

      {callouts.length > 0 && (
        <div>
          <h4 className="mb-2.5 text-[12px] font-bold uppercase tracking-[0.14em] text-slate-400">What changed</h4>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {callouts.map((c, i) => (
              <Callout key={c.key} metric={c} index={i} />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CompareOverview({ compare }) {
  const [spotlight, setSpotlight] = useState(null)
  const schools = compare.schools
  const cashCells = schools
    .map((s) => ({ name: s.schoolName, cell: s.metrics?.days_cash_on_hand }))
    .filter((x) => x.cell?.value != null)
  const best = cashCells.slice().sort((a, b) => b.cell.value - a.cell.value)[0]
  const worst = cashCells.slice().sort((a, b) => a.cell.value - b.cell.value)[0]
  const { series, labels } = trendSeries(schools, compare.trends.bySchool)
  return (
    <div className="space-y-6">
      {(best || worst) && (
        <HeroBand eyebrow="Liquidity leaders" asOf={compare.asOf}>
          <div className="grid gap-3.5 sm:grid-cols-2">
            {best && (
              <V2StatTile
                index={0}
                label="Strongest liquidity"
                value={best.cell.formatted}
                status={best.cell.status}
                sub={`${best.name} — most days cash`}
              />
            )}
            {worst && best !== worst && (
              <V2StatTile
                index={1}
                label="Watch liquidity"
                value={worst.cell.formatted}
                status={worst.cell.status}
                sub={`${worst.name} — fewest days cash`}
              />
            )}
          </div>
        </HeroBand>
      )}
      <ChartCard title="Days cash on hand, by school" sub="Every selected school — hover a name to spotlight it" asOf={compare.asOf} delay={0.06}>
        <Legend items={series.map((s) => ({ id: s.id, label: s.label, color: s.color }))} onSpotlight={setSpotlight} />
        {series.length ? (
          <LineChart series={series} labels={labels} spotlightId={spotlight} formatter={(v) => Math.round(v).toLocaleString()} />
        ) : (
          <p className="py-8 text-center text-[13px] italic text-muted">No trend history for the selected schools.</p>
        )}
      </ChartCard>
    </div>
  )
}

function OrgOverview({ org }) {
  const om = org.orgMetrics
  const orgByKey = {}
  for (const mm of om?.metrics ?? []) orgByKey[mm.key] = mm
  // One row per reporting school — magnitude form. Color follows the ENTITY
  // (roster seriesIndex), never rank; BarList sorts desc without repainting.
  const contribRows = org.schools
    .map((s, i) => {
      const cell = s.metrics?.revenue_mix
      const value = cell?.value ?? 0
      if (!(value > 0)) return null
      return {
        id: s.schoolId,
        label: s.schoolName,
        color: schoolColor(s.seriesIndex ?? i),
        value,
        formatted: cell?.formatted ?? money(value),
      }
    })
    .filter(Boolean)
  const contribTotal = contribRows.reduce((a, r) => a + r.value, 0)
  const rows = contribRows.map((r) => ({
    ...r,
    share: contribTotal > 0 ? `${Math.round((100 * r.value) / contribTotal)}%` : null,
  }))
  return (
    <div className="space-y-6">
      <HeroBand eyebrow="System vitals" asOf={org.asOf}>
        <div className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
          <V2StatTile index={0} label="Schools" value={String(om?.schoolCount ?? '—')} sub={`${om?.reportedCount ?? 0} reporting this year`} />
          <V2StatTile index={1} label="Coverage" value={om ? `${om.reportedCount}/${om.schoolCount}` : '—'} sub="Schools with a saved FY" />
          <V2StatTile
            index={2}
            label="System operating margin"
            value={orgByKey.operating_margin ? formatMetric(orgByKey.operating_margin) : '—'}
            status={orgByKey.operating_margin?.status}
          />
          <V2StatTile
            index={3}
            label="System days cash"
            value={orgByKey.days_cash_on_hand ? formatMetric(orgByKey.days_cash_on_hand) : '—'}
            status={orgByKey.days_cash_on_hand?.status}
          />
        </div>
      </HeroBand>
      <ChartCard title="Who drives the system's revenue" sub="Every reporting school, largest first" asOf={org.asOf} delay={0.06}>
        {rows.length ? (
          <BarList rows={rows} formatter={money} />
        ) : (
          <p className="py-8 text-center text-[13px] italic text-muted">No revenue reported yet.</p>
        )}
      </ChartCard>
    </div>
  )
}

export default function OverviewView({ scope, school, compare, org }) {
  if (scope === 'compare') return <CompareOverview compare={compare} />
  if (scope === 'org') return <OrgOverview org={org} />
  return <SchoolOverview school={school} />
}
