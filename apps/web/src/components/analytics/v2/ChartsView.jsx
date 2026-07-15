// ─────────────────────────────────────────────────────────────────────────────
// ChartsView — the MOTION gallery, grouped by the QUESTION each cluster answers.
// Every visual is a <ChartCard id={anchorId} metricKey=…> so a scorecard "chart →"
// can fly to it (flash) and its own "view as table" twin can fly back to the row.
// School: money (mix donuts + margin/cash trends) & enrollment (trend + aid gauge +
// staffing stat). Compare: per-pupil grouped bars + fingerprint dimension rows.
// Org (all schools): emphasis line + same-scale small multiples + a 3-year bar
// race. Capacity/staffing-mix are DEFERRED (no registry metric) — substituted
// with real keys per contract.
//
// Each scope is its own component so hooks stay unconditional across scope switches.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react'
import { formatMetricValue } from '../../../lib/metricMeta.js'
import { schoolColor, CHROME } from './chartPalette.js'
import LineChart from '../charts/LineChart.jsx'
import FancyDonut from '../charts/FancyDonut.jsx'
import GroupedBars from '../charts/GroupedBars.jsx'
import DimensionRows from '../charts/DimensionRows.jsx'
import BarRace from '../charts/BarRace.jsx'
import ArcGauge from '../charts/ArcGauge.jsx'
import Legend from '../charts/Legend.jsx'
import { useMeasuredWidth } from '../charts/useMeasuredWidth.js'
import { useTooltip } from '../charts/Tooltip.jsx'
import ChartCard from './ChartCard.jsx'
import QuestionGroup from './QuestionGroup.jsx'
import { fingerprintDims, byMetric, formatMetric, foldMixComponents } from './helpers.js'

const money = (v) => formatMetricValue(v, 'currency')

// A line series is drawable only if it carries at least one finite point; an empty
// or all-null series would drive LineChart's domain to -Infinity → NaN coordinates.
const drawableLine = (s) => Array.isArray(s?.vals) && s.vals.some((v) => Number.isFinite(v))

// Composition as a BAR LIST (dataviz magnitude form) — school mixes are heavily
// skewed (tuition/salaries dominate), which turns a donut into one fat ring with
// crumbs; bars keep every category readable and directly labeled.
function BarsFromMix(metric) {
  const parts = metric?.components?.length ? foldMixComponents(metric.components) : null
  if (!parts) return <p className="py-8 text-center text-[13px] italic text-muted">Not available.</p>
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
      centerSub="Total"
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

// One same-scale small-multiple cell. Hand-rolled (LineChart autoscales per cell;
// the card promises ONE shared scale, so yMin/yMax are passed in explicitly).
// 2px round-cap line, end dot r=4 with a 2px surface ring, the end VALUE as the
// only direct label, solid hairline grid, crosshair + shared tooltip.
function SmallMultipleCell({ name, color, vals, labels, yMin, yMax, formatter }) {
  const tip = useTooltip()
  const svgRef = useRef(null)
  const [containerRef, W] = useMeasuredWidth(220)
  const [hoverI, setHoverI] = useState(null)
  const h = 84
  const P = { l: 6, r: 50, t: 10, b: 8 }
  const iw = W - P.l - P.r
  const ih = h - P.t - P.b
  const finite = (v) => (Number.isFinite(v) ? v : 0)
  const n = vals.length
  const X = (i) => P.l + (n < 2 ? iw / 2 : (iw * i) / (n - 1))
  const Y = (v) => P.t + ih * (1 - (finite(v) - yMin) / (yMax - yMin || 1))
  const line = vals.map((v, i) => (i ? 'L' : 'M') + X(i) + ' ' + Y(v)).join(' ')
  const last = Math.max(0, n - 1)

  function onMove(ev) {
    if (n < 2) return
    const svg = svgRef.current
    if (!svg) return
    const r = svg.getBoundingClientRect()
    const mx = (ev.clientX - r.left) * (W / r.width)
    let i = Math.round((mx - P.l) / (iw / (n - 1)))
    i = Math.max(0, Math.min(n - 1, i))
    setHoverI(i)
    tip.show(
      { title: labels[i] ?? '', rows: [{ color, label: name, value: formatter(finite(vals[i])) }] },
      ev.clientX,
      ev.clientY,
    )
  }
  function onLeave() {
    setHoverI(null)
    tip.hide()
  }

  return (
    <div ref={containerRef} style={{ width: '100%' }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${h}`}
        width="100%"
        height={h}
        role="img"
        aria-label={`${name}: ${formatter(finite(vals[last]))} latest`}
        onMouseMove={onMove}
        onMouseLeave={onLeave}
      >
        {/* solid hairline grid — top of band + baseline */}
        <line x1={P.l} x2={W - P.r} y1={P.t} y2={P.t} stroke={CHROME.grid} strokeWidth="1" />
        <line x1={P.l} x2={W - P.r} y1={P.t + ih} y2={P.t + ih} stroke={CHROME.grid} strokeWidth="1" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={X(last)} cy={Y(vals[last])} r="4" fill={color} stroke="#fff" strokeWidth="2" />
        <text
          x={X(last) + 7}
          y={Y(vals[last]) + 3.5}
          fill={CHROME.inkSoft}
          fontSize="10.5"
          fontWeight="700"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {formatter(finite(vals[last]))}
        </text>
        {hoverI != null && (
          <line x1={X(hoverI)} x2={X(hoverI)} y1={P.t} y2={P.t + ih} stroke={CHROME.crosshair} strokeWidth="1" />
        )}
      </svg>
    </div>
  )
}

// Title attr only when the name genuinely overflows its cell (measured, not guessed).
const fitTitle = (label) => (el) => {
  if (!el) return
  if (el.scrollWidth > el.clientWidth + 1) el.title = label
  else el.removeAttribute('title')
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
            {BarsFromMix(m.revenue_mix)}
          </ChartCard>
          <ChartCard id="chart-expmix" metricKey="expense_mix" title="Where the money goes" sub="Expense mix" asOf={asOf} onViewAsTable={onCrossToTable}>
            {BarsFromMix(m.expense_mix)}
          </ChartCard>
          <ChartCard id="chart-margin" metricKey="operating_margin" title="Operating margin" sub="Across your saved periods" asOf={asOf} onViewAsTable={onCrossToTable}>
            {TrendCard(t.operating_margin, schoolColor(0), (v) => `${(v * 100).toFixed(1)}%`)}
          </ChartCard>
          <ChartCard id="chart-cash" metricKey="days_cash_on_hand" title="Days cash on hand" sub="Liquidity trend" asOf={asOf} onViewAsTable={onCrossToTable}>
            {TrendCard(t.days_cash_on_hand, schoolColor(4), (v) => Math.round(v).toLocaleString())}
          </ChartCard>
        </div>
      </QuestionGroup>
      <QuestionGroup title="How's enrollment?">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard id="chart-enrollment" metricKey="enrollment_change_yoy" title="Enrollment change" sub="Year over year" asOf={asOf} onViewAsTable={onCrossToTable}>
            {TrendCard(t.enrollment_change_yoy, schoolColor(2), (v) => `${(v * 100).toFixed(1)}%`)}
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
  const schools = compare.schools
  const cost = byMetric(schools, 'cost_per_pupil')
  const net = byMetric(schools, 'net_tuition_per_student')
  const rows = schools.map((s, i) => ({
    label: s.schoolName,
    dot: schoolColor(s.seriesIndex ?? i),
    vals: [cost[i]?.cell?.value ?? 0, net[i]?.cell?.value ?? 0],
  }))
  const dims = fingerprintDims(schools.slice(0, 5))
  const hasFingerprint = dims.some((d) => d.cells.some((c) => c.score != null))
  return (
    <QuestionGroup title="How do we compare?">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard id="chart-ppc" metricKey="cost_per_pupil" title="Per-pupil economics" sub="Cost per pupil vs. net tuition per student" asOf={compare.asOf}>
          <Legend
            items={[
              { id: 'cost', label: 'Cost per pupil', color: schoolColor(0) },
              { id: 'net', label: 'Net tuition/student', color: schoolColor(1) },
            ]}
          />
          {rows.length ? (
            <GroupedBars rows={rows} colors={[schoolColor(0), schoolColor(1)]} names={['Cost per pupil', 'Net tuition/student']} formatter={money} />
          ) : (
            <p className="py-8 text-center text-[13px] italic text-muted">Select schools to compare.</p>
          )}
        </ChartCard>
        <ChartCard id="chart-fingerprint" metricKey="days_cash_on_hand" title="School fingerprints" sub="Five health dimensions, every selected school — longer is better" asOf={compare.asOf}>
          {hasFingerprint ? (
            <DimensionRows dims={dims} />
          ) : (
            <p className="py-8 text-center text-[13px] italic text-muted">
              {schools.length ? 'No metric data for the selected schools yet.' : 'Select schools to compare.'}
            </p>
          )}
        </ChartCard>
      </div>
    </QuestionGroup>
  )
}

function OrgCharts({ org }) {
  // Hooks first — before any series-building loops (hook-order hygiene).
  const [spotlight, setSpotlight] = useState(null)
  const schools = org.schools
  const bySchool = org.trends.bySchool
  const built = []
  let labels = []
  for (const s of schools) {
    const tr = bySchool[s.schoolId]
    if (!tr?.points?.length) continue
    const vals = tr.points.map((p) => (Number.isFinite(p.value) ? p.value : null))
    if (tr.points.length > labels.length) labels = tr.points.map((p) => p.label)
    built.push({ id: s.schoolId, label: s.schoolName, color: schoolColor(s.seriesIndex ?? 0), vals })
  }
  // Drop schools with no finite point so LineChart never sees an all-null series.
  const series = built.filter(drawableLine)
  // Emphasis: the STATE-provided primary school when it is in the series
  // (defensive fallback to the first drawable series), rest are context.
  const emph = (org.primarySchoolId != null && series.find((s) => s.id === org.primarySchoolId)) || series[0] || null
  const emphId = emph?.id ?? null
  // Direct end-label ONLY the emphasized school; the legend carries the rest.
  const lineSeries = series.map((s) => (s.id === emphId ? s : { ...s, label: '' }))
  // ONE shared y-domain so every small-multiple cell really is the same scale.
  const allVals = series.flatMap((s) => s.vals).filter((v) => Number.isFinite(v))
  const yMin = Math.min(0, ...(allVals.length ? allVals : [0]))
  const yMax = (allVals.length ? Math.max(...allVals) : 1) * 1.05 || 1
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
          return v == null ? null : { id: s.schoolId, name: s.schoolName, color: schoolColor(s.seriesIndex ?? si), value: v }
        })
        .filter(Boolean),
    })
  }
  return (
    <div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard
          id="chart-cash"
          metricKey="days_cash_on_hand"
          title={emph ? `Days cash — ${emph.label} highlighted` : 'Days cash — one school highlighted'}
          sub="The rest are context"
          asOf={org.asOf}
        >
          {series.length ? (
            <>
              <Legend items={series.map((s) => ({ id: s.id, label: s.label, color: s.color }))} onSpotlight={setSpotlight} />
              <LineChart series={lineSeries} labels={labels} deemphId={emphId} spotlightId={spotlight} formatter={(v) => Math.round(v).toLocaleString()} />
            </>
          ) : (
            <p className="py-8 text-center text-[13px] italic text-muted">No trend history yet.</p>
          )}
        </ChartCard>
        <ChartCard id="chart-smalls" metricKey="days_cash_on_hand" title="Days cash, school by school" sub="Small multiples, same scale" asOf={org.asOf}>
          <div className="grid grid-cols-2 gap-3">
            {series.map((s) => (
              <div key={s.id} className="rounded-lg border border-rule/50 p-2">
                <p ref={fitTitle(s.label)} className="mb-1 flex items-center gap-1.5 truncate text-[11px] font-semibold text-navy">
                  <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
                  {s.label}
                </p>
                <SmallMultipleCell
                  name={s.label}
                  color={s.color}
                  vals={s.vals}
                  labels={labels}
                  yMin={yMin}
                  yMax={yMax}
                  formatter={(v) => Math.round(v).toLocaleString()}
                />
              </div>
            ))}
          </div>
        </ChartCard>
      </div>
      <div className="mt-4">
        <ChartCard id="chart-race" metricKey="days_cash_on_hand" title="Days cash on hand — the race" sub="Watch the ranking move across the years" asOf={org.asOf}>
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

export default function ChartsView({ scope, school, compare, org, onCrossToTable }) {
  // "View as table" only makes sense in School scope (the Scorecard there has the
  // per-metric rows to flash). Compare/Org scorecards ignore highlight, so the
  // reverse cross-link is omitted there rather than dead-linking.
  if (scope === 'compare') return <CompareCharts compare={compare} />
  if (scope === 'org') return <OrgCharts org={org} />
  return <SchoolCharts school={school} onCrossToTable={onCrossToTable} />
}
