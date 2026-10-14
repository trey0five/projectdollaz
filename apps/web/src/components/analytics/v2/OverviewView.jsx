// ─────────────────────────────────────────────────────────────────────────────
// OverviewView — the 30-second story for each scope, in the ledger grammar
// (Premium UI P3, plan §2 + sketch 4). School: the four KPIs as a `StatStrip`
// on the ground (count-up once, delta Pill, 2px status mark, sparkline), then
// the revenue-mix donut (1/3) beside the days-cash trend (2/3) as chart
// Sections, then "What changed" as a small DataTable. Compare: the liquidity
// leader / laggard as Stats + the multi-school days-cash trend. Org (all
// schools): four system Stats + the per-school revenue columns. Values are the
// SAME @finrep/analytics-formatted strings the Scorecard prints (value parity:
// Stat count-up = AnimatedMetricValue over the same value + metricFormat); the
// motion gallery still lives in Charts. No dark band: the one dark stage is the
// Home briefing (plan §2.1).
//
// Each scope is its OWN component so hooks stay unconditional across scope
// switches.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { formatMetricValue, deltaTone } from '../../../lib/metricMeta.js'
import { schoolColor } from './chartPalette.js'
import LineChart from '../charts/LineChart.jsx'
import ColumnChart from '../charts/ColumnChart.jsx'
import FancyDonut from '../charts/FancyDonut.jsx'
import Legend from '../charts/Legend.jsx'
import Sparkline from '../charts/Sparkline.jsx'
import ChartCard from './ChartCard.jsx'
import { lightStatus, DELTA_TONE, MARK } from './statusStyle.js'
import { formatMetric, formatMetricDeltaOf, foldMixComponents, metricFormat } from './helpers.js'
import { Section, StatStrip, Stat, DataTable, Pill } from '../../ui/surface/index.js'

const SCHOOL_KPI_KEYS = ['operating_margin', 'days_cash_on_hand', 'months_operating_reserve', 'tuition_dependency']

const money = (v) => formatMetricValue(v, 'currency')

/** A MetricResult → the Stat props (value parity: number + canonical format). */
function statPropsOf(metric) {
  const deltaText = formatMetricDeltaOf(metric)
  const tone = DELTA_TONE[deltaTone(metric.periodOverPeriodDelta, metric.goodDirection)] ?? 'neutral'
  const numeric = typeof metric.value === 'number' && Number.isFinite(metric.value)
  return {
    label: metric.label,
    value: numeric ? metric.value : formatMetric(metric),
    format: numeric ? metricFormat(metric.key, metric.unit) : undefined,
    status: MARK[metric.status],
    delta: deltaText ? { text: deltaText, tone } : null,
  }
}

/** Composition as a BAR LIST (the dataviz "magnitude" form) with the total as a
    headline. School revenue is heavily skewed (tuition ≈ 87%), which turns a
    donut into one fat ring with crumbs — bars keep every category readable.
    Segments are folded to ≤6 with a DEEMPH "Other" (foldMixComponents), so hues
    never cycle past the fixed slots. */
function MixBars({ metric, sub = 'Total revenue' }) {
  const parts = metric?.components?.length ? foldMixComponents(metric.components) : null
  if (!parts) return <p className="py-8 text-center text-small italic text-ink2">Revenue mix not available.</p>
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

const CHANGE_COLUMNS = [
  { key: 'label', header: 'Metric', render: (m) => <span className="font-semibold text-ink">{m.label}</span> },
  { key: 'now', header: 'Now', num: true, render: (m) => formatMetric(m) },
  {
    key: 'change',
    header: 'Change',
    num: true,
    render: (m) => (
      <Pill variant="status" tone={DELTA_TONE[deltaTone(m.periodOverPeriodDelta, m.goodDirection)] ?? 'neutral'}>
        {formatMetricDeltaOf(m)}
      </Pill>
    ),
  },
]

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
    <div>
      <Section label="School vitals" aside={school.asOf} className="!mt-0" aria-label="School vitals">
        {kpis.length ? (
          <StatStrip cols={kpis.length}>
            {kpis.map((k) => {
              const metric = m[k]
              const spark = (school.sparkTrends?.[k]?.points ?? []).map((p) => p.value).filter((v) => Number.isFinite(v))
              return (
                <Stat key={`${k}:${school.periodId}`} {...statPropsOf(metric)}>
                  {spark.length >= 2 ? (
                    <div className="mt-2 h-8">
                      <Sparkline vals={spark} color={lightStatus(metric.status).dot} h={32} fill stretch />
                    </div>
                  ) : null}
                </Stat>
              )
            })}
          </StatStrip>
        ) : (
          <p className="py-6 text-small italic text-ink2">No vitals for this period yet.</p>
        )}
      </Section>

      {/* Asymmetric split: donut 1/3 · days-cash area 2/3 — both on the ground. */}
      <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-3">
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
            <p className="py-8 text-center text-small italic text-ink2">Not enough history yet.</p>
          )}
        </ChartCard>
      </div>

      {callouts.length > 0 && (
        <Section label="What changed" aside="largest moves vs. the prior period">
          <DataTable
            columns={CHANGE_COLUMNS}
            rows={callouts}
            rowKey="key"
            markOf={(r) => MARK[r.status] ?? null}
            caption="What changed since the prior period"
          />
        </Section>
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
  const leaders = [
    best && { key: 'best', label: 'Strongest liquidity', cell: best.cell, note: `${best.name} — most days cash` },
    worst && best !== worst && { key: 'worst', label: 'Watch liquidity', cell: worst.cell, note: `${worst.name} — fewest days cash` },
  ].filter(Boolean)
  return (
    <div>
      {leaders.length > 0 && (
        <Section label="Liquidity leaders" aside={compare.asOf} className="!mt-0">
          <StatStrip cols={leaders.length}>
            {leaders.map((l) => (
              <Stat key={l.key} label={l.label} value={l.cell.formatted ?? '—'} status={MARK[l.cell.status]} note={l.note} />
            ))}
          </StatStrip>
        </Section>
      )}
      <div className="mt-8">
        <ChartCard title="Days cash on hand, by school" sub="Every selected school — hover a name to spotlight it" asOf={compare.asOf} delay={0.06}>
          <Legend items={series.map((s) => ({ id: s.id, label: s.label, color: s.color }))} onSpotlight={setSpotlight} />
          {series.length ? (
            <LineChart series={series} labels={labels} spotlightId={spotlight} formatter={(v) => Math.round(v).toLocaleString()} />
          ) : (
            <p className="py-8 text-center text-small italic text-ink2">No trend history for the selected schools.</p>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

function OrgOverview({ org }) {
  const om = org.orgMetrics
  const orgByKey = {}
  for (const mm of om?.metrics ?? []) orgByKey[mm.key] = mm
  // One column per reporting school — magnitude form, largest first. Color
  // follows the ENTITY (roster seriesIndex), never rank; sorting never repaints.
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
  const rows = [...contribRows]
    .sort((a, b) => b.value - a.value)
    .map((r) => ({
      ...r,
      meta: contribTotal > 0 ? [{ label: 'Share of system', value: `${Math.round((100 * r.value) / contribTotal)}%` }] : [],
    }))
  const margin = orgByKey.operating_margin
  const cash = orgByKey.days_cash_on_hand
  return (
    <div>
      <Section label="System vitals" aside={org.asOf} className="!mt-0">
        <StatStrip cols={4}>
          <Stat label="Schools" value={om?.schoolCount ?? '—'} note={`${om?.reportedCount ?? 0} reporting this year`} />
          <Stat label="Coverage" value={om ? `${om.reportedCount}/${om.schoolCount}` : '—'} note="Schools with a saved FY" />
          <Stat label="System operating margin" value={margin ? formatMetric(margin) : '—'} status={MARK[margin?.status]} />
          <Stat label="System days cash" value={cash ? formatMetric(cash) : '—'} status={MARK[cash?.status]} />
        </StatStrip>
      </Section>
      <div className="mt-8">
        <ChartCard title="Who drives the system's revenue" sub="Every reporting school, largest first" asOf={org.asOf} delay={0.06}>
          {rows.length ? (
            <ColumnChart rows={rows} formatter={money} ariaLabel="Revenue by school, largest first" showValues="selective" />
          ) : (
            <p className="py-8 text-center text-small italic text-ink2">No revenue reported yet.</p>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

export default function OverviewView({ scope, school, compare, org }) {
  if (scope === 'compare') return <CompareOverview compare={compare} />
  if (scope === 'org') return <OrgOverview org={org} />
  return <SchoolOverview school={school} />
}
