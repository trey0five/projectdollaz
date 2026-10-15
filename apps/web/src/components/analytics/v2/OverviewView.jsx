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
import { formatMetricValue } from '../../../lib/metricMeta.js'
import { schoolColor } from './chartPalette.js'
import LineChart from '../charts/LineChart.jsx'
import ColumnChart from '../charts/ColumnChart.jsx'
import FancyDonut from '../charts/FancyDonut.jsx'
import Legend from '../charts/Legend.jsx'
import ChartCard from './ChartCard.jsx'
import { MARK } from './statusStyle.js'
import { formatMetric, formatMetricDeltaOf, foldMixComponents } from './helpers.js'
import { Building2, Sparkles, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import { AuroraSection, AuroraTile, AuroraTileGrid, verdictCountLabel } from '../../ui/aurora/index.js'

const money = (v) => formatMetricValue(v, 'currency')

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

function SchoolOverview({ school }) {
  const m = school.metricsByKey
  const cashTrend = school.sparkTrends?.days_cash_on_hand
  const callouts = useMemo(
    () =>
      (school.metrics || [])
        .filter((x) => x.available && x.periodOverPeriodDelta != null && x.periodOverPeriodDelta !== 0 && x.status && x.status !== 'neutral')
        .sort((a, b) => Math.abs(b.periodOverPeriodDelta) - Math.abs(a.periodOverPeriodDelta))
        .slice(0, 3),
    [school.metrics],
  )
  // The four vitals live on the band (AnalyticsV2) — here: what moved, then
  // the two charts.
  return (
    <div>
      {callouts.length > 0 && (
        <AuroraSection
          first
          icon={Sparkles}
          title="What changed"
          subtitle="The biggest moves since last year"
          count={verdictCountLabel(callouts.map((c) => c.status))}
        >
          <AuroraTileGrid cols={Math.max(2, callouts.length)}>
            {callouts.map((c) => {
              const delta = formatMetricDeltaOf(c)
              return (
                <AuroraTile
                  key={c.key}
                  icon={c.periodOverPeriodDelta >= 0 ? TrendingUp : TrendingDown}
                  title={c.label}
                  figure={formatMetric(c)}
                  desc={delta ? `${delta} since last year` : null}
                  verdict={c.status}
                />
              )
            })}
          </AuroraTileGrid>
        </AuroraSection>
      )}

      <AuroraSection first={!callouts.length} icon={Wallet} title="Money and cash" subtitle="Where income comes from, and days of cash" count={school.asOf}>
        {/* Asymmetric split: donut 1/3 · days-cash area 2/3. */}
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-3">
          <ChartCard title="Where the money comes from" sub="Revenue mix" delay={0.06}>
            <MixBars metric={m.revenue_mix} />
          </ChartCard>
          <ChartCard title="Days cash on hand" sub="Across your saved years" delay={0.12} className="lg:col-span-2">
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
      </AuroraSection>
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
        <AuroraSection first icon={Wallet} title="Cash, best and worst" subtitle="Days of cash across the schools" count={compare.asOf}>
          <AuroraTileGrid cols={2}>
            {leaders.map((l) => (
              <AuroraTile
                key={l.key}
                icon={l.key === 'best' ? TrendingUp : TrendingDown}
                title={l.label}
                figure={l.cell.formatted ?? '—'}
                unit="days"
                desc={l.note}
                verdict={MARK[l.cell.status] ? l.cell.status : null}
              />
            ))}
          </AuroraTileGrid>
        </AuroraSection>
      )}
      <AuroraSection first={!leaders.length} icon={Building2} title="Days of cash, by school" subtitle="Hover a name to spotlight it">
        <ChartCard title="Days cash on hand, by school" sub="Every selected school" asOf={compare.asOf} delay={0.06}>
          <Legend items={series.map((s) => ({ id: s.id, label: s.label, color: s.color }))} onSpotlight={setSpotlight} />
          {series.length ? (
            <LineChart series={series} labels={labels} spotlightId={spotlight} formatter={(v) => Math.round(v).toLocaleString()} />
          ) : (
            <p className="py-8 text-center text-small italic text-ink2">No trend history for the selected schools.</p>
          )}
        </ChartCard>
      </AuroraSection>
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
  // The system figures (schools, margin, days cash) live on the band.
  return (
    <AuroraSection first icon={Building2} title="Revenue by school" subtitle="Who drives the system’s income" count={org.asOf}>
      <ChartCard title="Who drives the system's revenue" sub="Every reporting school, largest first" delay={0.06}>
        {rows.length ? (
          <ColumnChart rows={rows} formatter={money} ariaLabel="Revenue by school, largest first" showValues="selective" />
        ) : (
          <p className="py-8 text-center text-small italic text-ink2">No revenue reported yet.</p>
        )}
      </ChartCard>
    </AuroraSection>
  )
}

export default function OverviewView({ scope, school, compare, org }) {
  if (scope === 'compare') return <CompareOverview compare={compare} />
  if (scope === 'org') return <OrgOverview org={org} />
  return <SchoolOverview school={school} />
}
