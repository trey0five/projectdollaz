// ─────────────────────────────────────────────────────────────────────────────
// OverviewView — the CALM 30-second story for each scope. School: 4 KPI tiles
// (reusing HeroVitals for value parity with v1) + a revenue-mix donut + a days-cash
// trend + "what changed" callouts. Compare: best/worst leader callouts + a
// multi-school days-cash trend with legend spotlight. Diocese: 4 org KPI tiles +
// a revenue-contribution stacked bar. Count-ups + sparklines only — the motion
// gallery lives in Charts.
//
// Each scope is its OWN component so hooks stay unconditional across scope switches.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { TrendingDown, TrendingUp, Building2, Users } from 'lucide-react'
import HeroVitals from '../HeroVitals.jsx'
import { formatMetricValue } from '../../../lib/metricMeta.js'
import { seriesColor } from '../charts/palette.js'
import Donut from '../charts/Donut.jsx'
import LineChart from '../charts/LineChart.jsx'
import StackedBar from '../charts/StackedBar.jsx'
import Legend from '../charts/Legend.jsx'
import { formatMetric, formatMetricDeltaOf } from './helpers.js'

const SCHOOL_KPI_KEYS = ['operating_margin', 'days_cash_on_hand', 'months_operating_reserve', 'tuition_dependency']

function StatTile({ icon, label, value, sub }) {
  return (
    <div className="card-vital flex flex-col gap-1 p-4 sm:p-5">
      <div className="flex items-center gap-2 text-muted">
        {icon}
        <span className="text-[12px] font-semibold uppercase tracking-[0.1em]">{label}</span>
      </div>
      <span className="font-serif text-2xl font-semibold text-navy tabular-nums sm:text-[28px]">{value}</span>
      {sub && <span className="text-[12.5px] text-muted">{sub}</span>}
    </div>
  )
}

function Callout({ metric }) {
  const delta = formatMetricDeltaOf(metric)
  const up = (metric.periodOverPeriodDelta ?? 0) >= 0
  const good =
    metric.goodDirection === 'neutral' ? 'neutral' : (metric.goodDirection === 'higher') === up ? 'good' : 'bad'
  const tone = good === 'good' ? 'text-[#2f7d4f]' : good === 'bad' ? 'text-danger' : 'text-muted'
  return (
    <div className="card-soft flex items-center gap-3 p-3.5">
      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${good === 'bad' ? 'bg-danger/10 text-danger' : 'bg-gold/10 text-gold'}`}>
        {up ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
      </span>
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-navy">{metric.label}</p>
        <p className="text-[12.5px] text-muted">
          Now <b className="text-navy">{formatMetric(metric)}</b>
          {delta && <span className={`ml-1 font-semibold ${tone}`}>({delta})</span>}
        </p>
      </div>
    </div>
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
      color: seriesColor(s.seriesIndex ?? 0),
      vals: t.points.map((p) => p.value ?? 0),
    })
  }
  return { series, labels }
}

function SchoolOverview({ school }) {
  const m = school.metricsByKey
  const rev = m.revenue_mix
  const revParts = rev?.components?.length ? rev.components : null
  const cashTrend = school.sparkTrends?.days_cash_on_hand
  const callouts = useMemo(
    () =>
      (school.metrics || [])
        .filter((x) => x.available && x.periodOverPeriodDelta != null && x.status && x.status !== 'neutral')
        .sort((a, b) => Math.abs(b.periodOverPeriodDelta) - Math.abs(a.periodOverPeriodDelta))
        .slice(0, 3),
    [school.metrics],
  )
  return (
    <div className="space-y-5">
      <HeroVitals
        vitalKeys={SCHOOL_KPI_KEYS.filter((k) => m[k])}
        metricsByKey={m}
        trendsByKey={school.sparkTrends || {}}
        periodKey={school.periodId}
        onOpen={() => {}}
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="card-soft p-4 sm:p-5">
          <h4 className="mb-1 font-serif text-base font-semibold text-navy">Where the money comes from</h4>
          <p className="mb-2 text-[12.5px] text-muted">Revenue mix</p>
          {revParts ? (
            <Donut
              parts={revParts.map((c) => c.value ?? 0)}
              colors={revParts.map((_, i) => seriesColor(i))}
              names={revParts.map((c) => c.label)}
              center={formatMetric(rev)}
              sub="Total revenue"
              formatter={(v) => formatMetricValue(v, 'currency')}
            />
          ) : (
            <p className="py-8 text-center text-[13px] italic text-muted">Revenue mix not available.</p>
          )}
        </div>
        <div className="card-soft p-4 sm:p-5">
          <h4 className="mb-1 font-serif text-base font-semibold text-navy">Days cash on hand</h4>
          <p className="mb-2 text-[12.5px] text-muted">Liquidity across your saved periods</p>
          {cashTrend?.points?.length >= 2 ? (
            <LineChart
              series={[{ id: 'cash', label: 'Days cash', color: seriesColor(0), vals: cashTrend.points.map((p) => p.value ?? 0) }]}
              labels={cashTrend.points.map((p) => p.label)}
              area
              formatter={(v) => Math.round(v).toLocaleString()}
            />
          ) : (
            <p className="py-8 text-center text-[13px] italic text-muted">Not enough history yet.</p>
          )}
        </div>
      </div>
      {callouts.length > 0 && (
        <div>
          <h4 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">What changed</h4>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {callouts.map((c) => (
              <Callout key={c.key} metric={c} />
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
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {best && <StatTile icon={<TrendingUp size={15} />} label="Strongest liquidity" value={best.cell.formatted} sub={`${best.name} — most days cash`} />}
        {worst && best !== worst && (
          <StatTile icon={<TrendingDown size={15} />} label="Watch liquidity" value={worst.cell.formatted} sub={`${worst.name} — fewest days cash`} />
        )}
      </div>
      <div className="card-soft p-4 sm:p-5">
        <h4 className="mb-1 font-serif text-base font-semibold text-navy">Days cash on hand, by school</h4>
        <p className="mb-2 text-[12.5px] text-muted">Every selected school — hover a name to spotlight it</p>
        <Legend items={series.map((s) => ({ id: s.id, label: s.label, color: s.color }))} onSpotlight={setSpotlight} />
        {series.length ? (
          <LineChart series={series} labels={labels} spotlightId={spotlight} formatter={(v) => Math.round(v).toLocaleString()} />
        ) : (
          <p className="py-8 text-center text-[13px] italic text-muted">No trend history for the selected schools.</p>
        )}
      </div>
    </div>
  )
}

function DioceseOverview({ diocese }) {
  const org = diocese.orgMetrics
  const orgByKey = {}
  for (const mm of org?.metrics ?? []) orgByKey[mm.key] = mm
  const contrib = diocese.schools
    .map((s, i) => ({ name: s.schoolName, value: s.metrics?.revenue_mix?.value ?? 0, color: seriesColor(s.seriesIndex ?? i) }))
    .filter((x) => x.value > 0)
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile icon={<Building2 size={15} />} label="Schools" value={org?.schoolCount ?? '—'} sub={`${org?.reportedCount ?? 0} reporting this year`} />
        <StatTile icon={<Users size={15} />} label="Coverage" value={org ? `${org.reportedCount}/${org.schoolCount}` : '—'} sub="Schools with a saved FY" />
        <StatTile icon={<TrendingUp size={15} />} label="System operating margin" value={orgByKey.operating_margin ? formatMetric(orgByKey.operating_margin) : '—'} />
        <StatTile icon={<TrendingUp size={15} />} label="System days cash" value={orgByKey.days_cash_on_hand ? formatMetric(orgByKey.days_cash_on_hand) : '—'} />
      </div>
      <div className="card-soft p-4 sm:p-5">
        <h4 className="mb-1 font-serif text-base font-semibold text-navy">Who drives the system&rsquo;s revenue</h4>
        <p className="mb-3 text-[12.5px] text-muted">One bar, every reporting school</p>
        {contrib.length ? (
          <>
            <StackedBar
              rows={[{ parts: contrib.map((c) => c.value) }]}
              colors={contrib.map((c) => c.color)}
              names={contrib.map((c) => c.name)}
              height={30}
              labelInside={false}
              formatter={(v) => formatMetricValue(v, 'currency')}
            />
            <div className="mt-3">
              <Legend items={contrib.map((c) => ({ id: c.name, label: c.name, color: c.color }))} onSpotlight={() => {}} />
            </div>
          </>
        ) : (
          <p className="py-8 text-center text-[13px] italic text-muted">No revenue reported yet.</p>
        )}
      </div>
    </div>
  )
}

export default function OverviewView({ scope, school, compare, diocese }) {
  if (scope === 'compare') return <CompareOverview compare={compare} />
  if (scope === 'diocese') return <DioceseOverview diocese={diocese} />
  return <SchoolOverview school={school} />
}
