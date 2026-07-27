// ─────────────────────────────────────────────────────────────────────────────
// TrendSpark — the shared single-series trend card body used by the analytics-v2
// Charts view AND the /hr staffing-trend section. Extracted VERBATIM from
// ChartsView's internal TrendCard so the render output is unchanged: an area
// LineChart over the metric's trend points, or the friendly "Not enough history
// yet." placeholder when fewer than two points exist.
// ─────────────────────────────────────────────────────────────────────────────
import LineChart from '../charts/LineChart.jsx'

export default function TrendSpark({ trend, color, formatter }) {
  if (!(trend?.points?.length >= 2))
    return <p className="py-8 text-center text-[13px] italic text-muted">Not enough history yet.</p>
  return (
    <LineChart
      series={[{ id: 't', label: '', color, vals: trend.points.map((p) => p.value ?? 0) }]}
      labels={trend.points.map((p) => p.label)}
      area
      formatter={formatter}
    />
  )
}
