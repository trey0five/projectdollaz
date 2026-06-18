import { useReducedMotion } from 'framer-motion'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import { PALETTE, formatMetricValue, metricFormat } from '../../lib/metricMeta.js'

/**
 * Wide trend area/line of the focused metric across periods. Navy->transparent
 * area fill, gold line, animated draw-in (reduced-motion-gated). Lazy-loaded by
 * the dashboard so recharts' heavier pieces stay off the initial card grid.
 */
export default function TrendChart({ trend }) {
  const reduce = useReducedMotion()

  if (!trend) return null
  const fmt = metricFormat(trend.metric, trend.unit)
  const data = trend.points.map((p) => ({
    label: p.label,
    value: p.value,
  }))
  const hasData = data.some((d) => d.value != null)

  if (!hasData) {
    return (
      <div className="flex h-52 items-center justify-center text-[13px] italic text-muted sm:h-64">
        No data points for this metric yet — save more periods to see a trend.
      </div>
    )
  }

  return (
    <div className="h-52 w-full sm:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PALETTE.gold} stopOpacity={0.35} />
              <stop offset="100%" stopColor={PALETTE.navy} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#e6e0d2" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: PALETTE.muted }}
            tickLine={false}
            axisLine={{ stroke: '#e6e0d2' }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: PALETTE.muted }}
            tickLine={false}
            axisLine={false}
            width={48}
            tickFormatter={(v) => formatMetricValue(v, fmt)}
          />
          <Tooltip
            cursor={{ stroke: PALETTE.gold, strokeWidth: 1, strokeDasharray: '4 3' }}
            formatter={(value) => [formatMetricValue(value, fmt), trend.label]}
            contentStyle={{
              borderRadius: 12,
              border: `1px solid ${PALETTE.gold}`,
              fontSize: 12,
              fontFamily: 'Jost, system-ui, sans-serif',
            }}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={PALETTE.gold}
            strokeWidth={2.5}
            fill="url(#trendFill)"
            connectNulls
            dot={{ r: 3, fill: PALETTE.gold, stroke: '#fff', strokeWidth: 1 }}
            activeDot={{ r: 5, fill: PALETTE.gold, stroke: '#fff', strokeWidth: 2 }}
            isAnimationActive={!reduce}
            animationDuration={900}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
