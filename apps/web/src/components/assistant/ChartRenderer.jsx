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

export default function ChartRenderer({ spec }) {
  const data = Array.isArray(spec?.data) ? spec.data : []
  if (data.length === 0) return null
  const type = spec.chartType

  return (
    <div className="mt-2 rounded-lg border border-rule/60 bg-white p-2">
      {spec.title && <p className="mb-1 text-[13px] font-semibold text-navy">{spec.title}</p>}
      <ResponsiveContainer width="100%" height={180}>
        {type === 'line' ? (
          <LineChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9 }} width={44} />
            <Tooltip wrapperStyle={{ fontSize: 11 }} />
            <Line dataKey="value" stroke="#b89650" strokeWidth={2} dot={{ r: 2 }} />
          </LineChart>
        ) : type === 'pie' ? (
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="label" outerRadius={68} innerRadius={32}>
              {data.map((d, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip wrapperStyle={{ fontSize: 11 }} />
          </PieChart>
        ) : (
          <BarChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 9 }} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 9 }} width={44} />
            <Tooltip wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="value" fill="#b89650" radius={[3, 3, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  )
}
