// Lazy-loaded (recharts) renderer for the assistant's on-the-fly charts. Draws a
// bar / line / pie from a { title, chartType, data:[{label,value}] } spec.
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
} from 'recharts'

const COLORS = ['#b89650', '#1a2744', '#7a5e00', '#c8a86a', '#54648f', '#8b1a1a', '#d4b47a']

// Compact, unit-agnostic axis/tooltip labels ($10.9M, 450K, 1.2K). Without this the
// Y-axis rendered raw values like "10850000" that got clipped to "000000" inside the
// narrow axis on mobile — the "chart not working on mobile" symptom. Compact notation
// stays readable at any width (works for currency OR plain counts).
const compact = (n) =>
  typeof n === 'number' && Number.isFinite(n)
    ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n)
    : ''
const AXIS_W = 38

export default function ChartRenderer({ spec }) {
  const data = Array.isArray(spec?.data) ? spec.data : []
  if (data.length === 0) return null
  const type = spec.chartType

  return (
    <div className="mt-2 w-full min-w-0 rounded-lg border border-rule/60 bg-white p-2">
      {spec.title && <p className="mb-1 text-[13px] font-semibold text-navy">{spec.title}</p>}
      <ResponsiveContainer width="100%" height={180}>
        {type === 'line' ? (
          <LineChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9 }} width={AXIS_W} tickFormatter={compact} />
            <Tooltip wrapperStyle={{ fontSize: 11 }} formatter={(v) => compact(v)} />
            <Line dataKey="value" stroke="#b89650" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        ) : type === 'pie' ? (
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" outerRadius={68} innerRadius={32}>
              {data.map((d, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip wrapperStyle={{ fontSize: 11 }} formatter={(v) => compact(v)} />
          </PieChart>
        ) : (
          <BarChart data={data} margin={{ top: 5, right: 10, bottom: 0, left: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9 }} width={AXIS_W} tickFormatter={compact} />
            <Tooltip wrapperStyle={{ fontSize: 11 }} formatter={(v) => compact(v)} />
            <Bar dataKey="value" fill="#b89650" radius={[3, 3, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
