// ─────────────────────────────────────────────────────────────────────────────
// ChartsView — the MOTION gallery, grouped by the QUESTION each cluster answers.
// Every visual is a <ChartCard id={anchorId} metricKey=…> so a scorecard "chart →"
// can fly to it (flash) and its own "view as table" twin can fly back to the row.
// School: money (mix donuts + margin/cash trends) & enrollment (trend + aid gauge +
// staffing stat). Compare: per-pupil grouped bars + radar fingerprints. Diocese:
// emphasis line + enrollment small-multiples + a 3-year bar race. Capacity/staffing-
// mix are DEFERRED (no registry metric) — substituted with real keys per contract.
//
// Each scope is its own component so hooks stay unconditional across scope switches.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { formatMetricValue } from '../../../lib/metricMeta.js'
import { seriesColor } from '../charts/palette.js'
import Donut from '../charts/Donut.jsx'
import LineChart from '../charts/LineChart.jsx'
import GroupedBars from '../charts/GroupedBars.jsx'
import Radar from '../charts/Radar.jsx'
import BarRace from '../charts/BarRace.jsx'
import ArcGauge from '../charts/ArcGauge.jsx'
import Legend from '../charts/Legend.jsx'
import ChartCard from './ChartCard.jsx'
import QuestionGroup from './QuestionGroup.jsx'
import { radarFingerprints, byMetric, formatMetric } from './helpers.js'

const money = (v) => formatMetricValue(v, 'currency')

// A line series is drawable only if it carries at least one finite point; an empty
// or all-null series would drive LineChart's domain to -Infinity → NaN coordinates.
const drawableLine = (s) => Array.isArray(s?.vals) && s.vals.some((v) => Number.isFinite(v))

function DonutFromMix(metric) {
  const parts = metric?.components?.length ? metric.components : null
  if (!parts) return <p className="py-8 text-center text-[13px] italic text-muted">Not available.</p>
  return (
    <Donut
      parts={parts.map((c) => c.value ?? 0)}
      colors={parts.map((_, i) => seriesColor(i))}
      names={parts.map((c) => c.label)}
      center={formatMetric(metric)}
      sub="Total"
      formatter={money}
    />
  )
}

function TrendCard(trend, color, formatter) {
  if (!(trend?.points?.length >= 2)) return <p className="py-8 text-center text-[13px] italic text-muted">Not enough history yet.</p>
  return (
    <LineChart
      series={[{ id: 't', label: '', color, vals: trend.points.map((p) => p.value ?? 0) }]}
      labels={trend.points.map((p) => p.label)}
      area
      formatter={formatter}
    />
  )
}

function SchoolCharts({ school, onCrossToTable }) {
  const m = school.metricsByKey
  const t = school.sparkTrends || {}
  const asOf = school.asOf
  const aid = m.pct_students_on_aid
  const ratio = m.student_teacher_ratio
  return (
    <div>
      <QuestionGroup title="How's the money?">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard id="chart-revmix" metricKey="revenue_mix" title="Where the money comes from" sub="Revenue mix" asOf={asOf} onViewAsTable={onCrossToTable}>
            {DonutFromMix(m.revenue_mix)}
          </ChartCard>
          <ChartCard id="chart-expmix" metricKey="expense_mix" title="Where the money goes" sub="Expense mix" asOf={asOf} onViewAsTable={onCrossToTable}>
            {DonutFromMix(m.expense_mix)}
          </ChartCard>
          <ChartCard id="chart-margin" metricKey="operating_margin" title="Operating margin" sub="Across your saved periods" asOf={asOf} onViewAsTable={onCrossToTable}>
            {TrendCard(t.operating_margin, seriesColor(0), (v) => `${(v * 100).toFixed(1)}%`)}
          </ChartCard>
          <ChartCard id="chart-cash" metricKey="days_cash_on_hand" title="Days cash on hand" sub="Liquidity trend" asOf={asOf} onViewAsTable={onCrossToTable}>
            {TrendCard(t.days_cash_on_hand, seriesColor(3), (v) => Math.round(v).toLocaleString())}
          </ChartCard>
        </div>
      </QuestionGroup>
      <QuestionGroup title="How's enrollment?">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard id="chart-enrollment" metricKey="enrollment_change_yoy" title="Enrollment change" sub="Year over year" asOf={asOf} onViewAsTable={onCrossToTable}>
            {TrendCard(t.enrollment_change_yoy, seriesColor(2), (v) => `${(v * 100).toFixed(1)}%`)}
          </ChartCard>
          <ChartCard id="chart-aidrate" metricKey="pct_students_on_aid" title="Students on aid" sub="Share of enrollment receiving aid" asOf={asOf} onViewAsTable={onCrossToTable}>
            {aid?.value != null ? (
              <div className="flex flex-col items-center">
                <ArcGauge pct={(aid.value ?? 0) * 100} label="on aid" />
                {ratio?.value != null && (
                  <p id="chart-staffing" className="mt-2 text-[13px] text-muted">
                    Students per teacher: <b className="text-navy">{formatMetric(ratio)}</b>
                  </p>
                )}
              </div>
            ) : (
              <p className="py-8 text-center text-[13px] italic text-muted">Aid data not available.</p>
            )}
          </ChartCard>
        </div>
      </QuestionGroup>
    </div>
  )
}

function CompareCharts({ compare }) {
  const [spotlight, setSpotlight] = useState(null)
  const schools = compare.schools
  const cost = byMetric(schools, 'cost_per_pupil')
  const net = byMetric(schools, 'net_tuition_per_student')
  const rows = schools.map((s, i) => ({
    label: s.schoolName,
    dot: seriesColor(s.seriesIndex ?? i),
    vals: [cost[i]?.cell?.value ?? 0, net[i]?.cell?.value ?? 0],
  }))
  const fp = radarFingerprints(schools.slice(0, 3))
  return (
    <QuestionGroup title="How do we compare?">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard id="chart-ppc" metricKey="cost_per_pupil" title="Per-pupil economics" sub="Cost per pupil vs. net tuition per student" asOf={compare.asOf}>
          <Legend
            items={[
              { id: 'cost', label: 'Cost per pupil', color: seriesColor(0) },
              { id: 'net', label: 'Net tuition/student', color: seriesColor(1) },
            ]}
            onSpotlight={() => {}}
          />
          {rows.length ? (
            <GroupedBars rows={rows} colors={[seriesColor(0), seriesColor(1)]} names={['Cost per pupil', 'Net tuition/student']} formatter={money} />
          ) : (
            <p className="py-8 text-center text-[13px] italic text-muted">Select schools to compare.</p>
          )}
        </ChartCard>
        <ChartCard id="chart-fingerprint" metricKey="days_cash_on_hand" title="School fingerprints" sub="Up to three schools across five health dimensions" asOf={compare.asOf}>
          <Legend items={fp.series.map((s) => ({ id: s.id, label: s.id, color: s.color }))} onSpotlight={setSpotlight} />
          {fp.series.length ? (
            <div className="flex justify-center">
              <Radar axes={fp.axes} series={fp.series} spotlightId={spotlight} />
            </div>
          ) : (
            <p className="py-8 text-center text-[13px] italic text-muted">Select schools to compare.</p>
          )}
        </ChartCard>
      </div>
    </QuestionGroup>
  )
}

function DioceseCharts({ diocese }) {
  const schools = diocese.schools
  const bySchool = diocese.trends.bySchool
  // Emphasis line: keep the first reporting school coloured, grey the rest.
  const built = []
  let labels = []
  for (const s of schools) {
    const tr = bySchool[s.schoolId]
    if (!tr?.points?.length) continue
    const vals = tr.points.map((p) => (Number.isFinite(p.value) ? p.value : null))
    if (tr.points.length > labels.length) labels = tr.points.map((p) => p.label)
    built.push({ id: s.schoolId, label: s.schoolName, color: seriesColor(s.seriesIndex ?? 0), vals })
  }
  // Drop schools with no finite point so LineChart never sees an all-null series.
  const series = built.filter(drawableLine)
  const [spotlight, setSpotlight] = useState(null)
  const emphId = series[0]?.id ?? null
  // Bar race frames aligned by point index.
  const nFrames = Math.max(0, ...series.map((s) => s.vals.length))
  const frames = []
  for (let i = 0; i < nFrames; i++) {
    frames.push({
      year: labels[i] ?? `${i + 1}`,
      values: schools
        .map((s, si) => {
          const tr = bySchool[s.schoolId]
          const v = tr?.points?.[i]?.value
          return v == null ? null : { id: s.schoolId, name: s.schoolName, color: seriesColor(s.seriesIndex ?? si), value: v }
        })
        .filter(Boolean),
    })
  }
  return (
    <div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard id="chart-cash" metricKey="days_cash_on_hand" title="Days cash — one school highlighted" sub="The rest are context" asOf={diocese.asOf}>
          {series.length ? (
            <>
              <Legend items={series.map((s) => ({ id: s.id, label: s.label, color: s.color }))} onSpotlight={setSpotlight} />
              <LineChart series={series} labels={labels} deemphId={emphId} spotlightId={spotlight} formatter={(v) => Math.round(v).toLocaleString()} />
            </>
          ) : (
            <p className="py-8 text-center text-[13px] italic text-muted">No trend history yet.</p>
          )}
        </ChartCard>
        <ChartCard id="chart-smalls" metricKey="days_cash_on_hand" title="Days cash, school by school" sub="Small multiples, same scale" asOf={diocese.asOf}>
          <div className="grid grid-cols-2 gap-3">
            {series.map((s) => (
              <div key={s.id} className="rounded-lg border border-rule/50 p-2">
                <p className="mb-1 truncate text-[11px] font-semibold text-navy">{s.label}</p>
                <LineChart series={[{ id: s.id, label: '', color: s.color, vals: s.vals }]} labels={labels} height={90} formatter={(v) => Math.round(v).toLocaleString()} />
              </div>
            ))}
          </div>
        </ChartCard>
      </div>
      <div className="mt-4">
        <ChartCard id="chart-race" metricKey="days_cash_on_hand" title="Days cash on hand — the race" sub="Watch the ranking move across the years" asOf={diocese.asOf}>
          {frames.length ? (
            <BarRace frames={frames} />
          ) : (
            <p className="py-8 text-center text-[13px] italic text-muted">No multi-year history yet.</p>
          )}
        </ChartCard>
      </div>
    </div>
  )
}

export default function ChartsView({ scope, school, compare, diocese, onCrossToTable }) {
  // "View as table" only makes sense in School scope (the Scorecard there has the
  // per-metric rows to flash). Compare/Diocese scorecards ignore highlight, so the
  // reverse cross-link is omitted there rather than dead-linking.
  if (scope === 'compare') return <CompareCharts compare={compare} />
  if (scope === 'diocese') return <DioceseCharts diocese={diocese} />
  return <SchoolCharts school={school} onCrossToTable={onCrossToTable} />
}
