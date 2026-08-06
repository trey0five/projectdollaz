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
import { formatMetricValue, metricLabel } from '../../../lib/metricMeta.js'
import { schoolColor, CHROME } from './chartPalette.js'
import LineChart from '../charts/LineChart.jsx'
import TrendSpark from './TrendSpark.jsx'
import FancyDonut from '../charts/FancyDonut.jsx'
import GroupedBars from '../charts/GroupedBars.jsx'
import DimensionRows from '../charts/DimensionRows.jsx'
import BarRace from '../charts/BarRace.jsx'
import ArcGauge from '../charts/ArcGauge.jsx'
import Legend from '../charts/Legend.jsx'
import HealthRail from '../charts/HealthRail.jsx'
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


// TrendCard now lives in v2/TrendSpark.jsx (shared with /hr) — render-identical.
const TrendCard = (trend, color, formatter) => (
  <TrendSpark trend={trend} color={color} formatter={formatter} />
)

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

// Pull a $ operand off a metric's runtime inputs[] by fuzzy label/key match —
// resilient to the exact input key naming (the §0 contract freezes only that the
// raw currency operands ride along, not their key spellings).
const currencyInput = (m, re) =>
  m?.inputs?.find((i) => i.unit === 'currency' && re.test(String(i.label ?? i.key)))?.value ?? null

// Same fuzzy match without the unit filter (FTE operands carry a count unit).
const inputByKey = (m, re) =>
  m?.inputs?.find((i) => re.test(String(i.label ?? i.key)))?.value ?? null

// Signed percent for a value that IS a change (e.g. fte_change_yoy).
const signedPct = (v) =>
  v == null || !Number.isFinite(v) ? '—' : `${v > 0 ? '+' : ''}${(v * 100).toFixed(1)}%`

// Band-target sub line for a current-value (no-trend) card.
function bandTargetSub(m) {
  const b = m?.bands
  if (!b || !Number.isFinite(b.good)) return null
  const dir = b.goodDirection ?? m.goodDirection
  return `Target ${dir === 'lower' ? '≤' : '≥'} ${formatMetricValue(b.good, m.unit ?? 'ratio')}`
}

function SchoolCharts({ school, onCrossToTable }) {
  const m = school.metricsByKey
  const t = school.sparkTrends || {}
  const asOf = school.asOf
  const aid = m.pct_students_on_aid
  const ratio = m.student_teacher_ratio
  const share = m.teaching_staff_share
  const totalFte = m.total_staff_fte
  const fteYoy = m.fte_change_yoy
  const fvb = m.forecast_vs_budget_net
  const fom = m.forecast_operating_margin
  const readiness = m.plan_readiness
  // Gate-driven: an unlicensed school's gated metrics are stripped server-side, so
  // these groups simply don't render — the unlicensed page stays byte-identical.
  const hasHr = Boolean(ratio || share || totalFte || fteYoy)
  const hasPlanning = Boolean(fvb || fom || readiness)

  // Staff composition numbers: prefer the share metric's declared inputs, then
  // derive from share × total (never invent — null renders an em-dash).
  const totalFteVal = totalFte?.value ?? inputByKey(share, /total/i)
  const teachingFteVal =
    inputByKey(share, /teaching/i) ??
    (Number.isFinite(share?.value) && Number.isFinite(totalFteVal) ? share.value * totalFteVal : null)

  // Plan-variance $ operands off forecast_vs_budget_net's inputs[] (no new fetch).
  const budgetNet = currencyInput(fvb, /budget/i)
  const forecastNet = currencyInput(fvb, /forecast/i)
  const readyCount = Number.isFinite(readiness?.value) ? Math.round(readiness.value * 3) : null

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
              </div>
            ) : (
              <p className="py-8 text-center text-[13px] italic text-muted">Aid data not available.</p>
            )}
          </ChartCard>
        </div>
      </QuestionGroup>
      {hasHr && (
        <QuestionGroup title="How's staffing?">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* chart-staffing keeps its historic anchor id — old
                /analytics?metric=student_teacher_ratio deep links + the Scorecard
                "chart →" keep landing here. Renders whenever the ratio exists,
                aid data or not (the vanishing-footnote bug is dead). */}
            <ChartCard id="chart-staffing" metricKey="student_teacher_ratio" title="Students per teacher" sub="Staffing ratio" asOf={asOf} onViewAsTable={onCrossToTable}>
              {t.student_teacher_ratio?.points?.length >= 2 ? (
                <TrendSpark trend={t.student_teacher_ratio} color={schoolColor(3)} formatter={(v) => v.toFixed(1)} />
              ) : ratio?.value != null ? (
                <div className="flex flex-col items-center py-6">
                  <p className="text-[34px] font-bold leading-none text-navy tabular-nums">{formatMetric(ratio)}</p>
                  <p className="mt-2 text-[13px] text-muted">{bandTargetSub(ratio) ?? 'students per teacher'}</p>
                </div>
              ) : (
                <p className="py-8 text-center text-[13px] italic text-muted">Not available.</p>
              )}
            </ChartCard>
            <ChartCard id="chart-fte" metricKey="teaching_staff_share" title="Staff composition" sub="Teaching share of total staff" asOf={asOf} onViewAsTable={onCrossToTable}>
              {share?.value != null ? (
                <div className="flex flex-col items-center">
                  <ArcGauge
                    pct={(share.value ?? 0) * 100}
                    label="teaching"
                    subRows={[
                      { label: 'Teaching FTE', value: Number.isFinite(teachingFteVal) ? teachingFteVal.toLocaleString('en-US', { maximumFractionDigits: 1 }) : '—' },
                      { label: 'Total staff FTE', value: Number.isFinite(totalFteVal) ? totalFteVal.toLocaleString('en-US', { maximumFractionDigits: 1 }) : '—' },
                    ]}
                  />
                  {fteYoy?.value != null && (
                    <p className="mt-2 text-[13px] text-muted">
                      Teaching FTE vs. last year: <b className="text-navy">{signedPct(fteYoy.value)}</b>
                    </p>
                  )}
                </div>
              ) : (
                <p className="py-8 text-center text-[13px] italic text-muted">
                  Enter Teaching &amp; Total staff FTEs to light this up.
                </p>
              )}
            </ChartCard>
          </div>
        </QuestionGroup>
      )}
      {hasPlanning && (
        <QuestionGroup title="What's the plan?">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard id="chart-planvariance" metricKey="forecast_vs_budget_net" title="Forecast vs. budget" sub="Projected FY-end net vs. the plan" asOf={asOf} onViewAsTable={onCrossToTable}>
              {fvb?.value != null ? (
                <div>
                  <p className="mb-2 text-[13px] text-muted">
                    Forecast net lands <b className="text-navy">{formatMetric(fvb)}</b> of budgeted revenue{' '}
                    {fvb.value >= 0 ? 'above' : 'below'} the budgeted net.
                  </p>
                  {budgetNet != null && forecastNet != null ? (
                    budgetNet >= 0 && forecastNet >= 0 ? (
                      <>
                        <Legend
                          items={[
                            { id: 'budget', label: 'Budget net', color: schoolColor(1) },
                            { id: 'forecast', label: 'Forecast net', color: schoolColor(0) },
                          ]}
                        />
                        <GroupedBars
                          rows={[{ label: 'Net result', dot: schoolColor(0), vals: [budgetNet, forecastNet] }]}
                          colors={[schoolColor(1), schoolColor(0)]}
                          names={['Budget net', 'Forecast net']}
                          formatter={money}
                        />
                      </>
                    ) : (
                      /* A deficit net would draw as a ~1% "positive" sliver on the
                         positive-only bars (and TWO deficits as identical slivers,
                         hiding a much-worse forecast) — so negative nets render as
                         honest labeled $ stats instead of lying marks. */
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: 'Budget net', value: budgetNet, color: schoolColor(1) },
                          { label: 'Forecast net', value: forecastNet, color: schoolColor(0) },
                        ].map((s) => (
                          <div key={s.label} className="rounded-xl border border-rule/50 bg-cream/40 px-3 py-2.5">
                            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                              <i aria-hidden="true" className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                              {s.label}
                            </p>
                            <p className={`mt-1 text-[20px] font-bold leading-none tabular-nums ${s.value < 0 ? 'text-rose-600' : 'text-navy'}`}>
                              {money(s.value)}
                            </p>
                          </div>
                        ))}
                      </div>
                    )
                  ) : null}
                  {fom?.value != null && (
                    <p className="mt-3 text-[13px] text-muted">
                      Forecast operating margin: <b className="text-navy">{formatMetric(fom)}</b>
                      {m.operating_margin?.value != null && (
                        <> · actual so far: <b className="text-navy">{formatMetric(m.operating_margin)}</b></>
                      )}
                    </p>
                  )}
                </div>
              ) : (
                <p className="py-8 text-center text-[13px] italic text-muted">
                  Save a budget and an FY-end forecast to compare them here.
                </p>
              )}
            </ChartCard>
            <ChartCard id="chart-planreadiness" metricKey="plan_readiness" title="Plan readiness" sub="Budget · forecast · enrollment plan" asOf={asOf} onViewAsTable={onCrossToTable}>
              {readiness?.value != null ? (
                <div className="flex flex-col items-center py-4">
                  <p className="text-[34px] font-bold leading-none text-navy tabular-nums">
                    {readyCount != null ? `${readyCount} of 3` : formatMetric(readiness)}
                  </p>
                  <p className="mt-1.5 text-[13px] text-muted">planning artifacts in place this period</p>
                  {/* 3-segment band rail — no sparkline: planning carries no trend
                      threading in v1, and a dead trend card would be dishonest. */}
                  <div className="mt-4 flex w-full max-w-[220px] gap-1.5" role="img" aria-label={`${readyCount ?? 0} of 3 planning artifacts in place`}>
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="h-2 flex-1 rounded-full"
                        style={{ background: i < (readyCount ?? 0) ? schoolColor(0) : CHROME.grid }}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <p className="py-8 text-center text-[13px] italic text-muted">Not available.</p>
              )}
            </ChartCard>
          </div>
        </QuestionGroup>
      )}
    </div>
  )
}

/** The headline five, same order the peer view uses. */
const COMPARE_RAIL_KEYS = [
  'days_cash_on_hand',
  'operating_margin',
  'months_operating_reserve',
  'tuition_dependency',
  'cost_per_pupil',
]

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

  // THE SAME LANGUAGE AS PEERS. `DimensionRows` normalises every metric to a
  // 0–100 score, which makes the shapes comparable and throws the actual figures
  // and the healthy range away — so "longer is better" can look reassuring for a
  // school that is failing on all five. The rails put the real numbers back,
  // against the band, exactly as the peer view now does.
  const railKeys = COMPARE_RAIL_KEYS.filter((k) =>
    schools.some((s) => s.metrics?.[k]?.available !== false && s.metrics?.[k]?.value != null),
  )
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

      {railKeys.length > 0 && (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {railKeys.map((k) => {
            // The first school with a band defines the healthy range: bands are
            // a property of the METRIC, not of a school, so any of them serves.
            const withBands = schools.find((s) => s.metrics?.[k]?.bands)
            const bands = withBands?.metrics?.[k]?.bands ?? null
            const points = schools.map((s) => {
              const m = s.metrics?.[k]
              const v =
                m && m.available !== false && m.value != null && Number.isFinite(m.value)
                  ? m.value
                  : null
              return {
                id: s.schoolId,
                name: s.schoolName,
                value: v,
                formatted: v != null ? m?.formatted ?? null : null,
                // No focus school in Compare — every school is equally the
                // subject here, so none is singled out.
                isFocus: false,
              }
            })
            return (
              <ChartCard
                key={k}
                id={`chart-rail-${k}`}
                metricKey={k}
                title={metricLabel(k)}
                sub="Every school, against the healthy range"
                asOf={compare.asOf}
              >
                <HealthRail points={points} bands={bands} ariaLabel={metricLabel(k)} />
              </ChartCard>
            )
          })}
        </div>
      )}
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
