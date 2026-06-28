import { useId } from 'react'
import { useReducedMotion } from 'framer-motion'
import { ResponsiveContainer, AreaChart, Area, YAxis } from 'recharts'
import { PALETTE } from '../../lib/metricMeta.js'

/**
 * Compact per-card trend (gold stroke over a faint gold->transparent wash,
 * ~40px tall, axes/grid/tooltip off) with a glowing endpoint dot on the latest
 * point. `points` are TrendPoints; nulls (unavailable periods) are skipped via
 * connectNulls. Animated draw-in is reduced-motion-gated.
 */
export default function Sparkline({ points }) {
  const reduce = useReducedMotion()
  const gid = useId().replace(/:/g, '') // recharts/SVG ids can't contain ':'
  const data = (points ?? [])
    .filter((p) => p.value != null)
    .map((p) => ({ x: p.periodEndDate, y: p.value }))

  if (data.length < 2) {
    return (
      <div className="flex h-10 items-center text-[13px] italic text-muted">
        Trend builds as you save more periods
      </div>
    )
  }

  const lastIndex = data.length - 1

  return (
    <div className="h-10 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, bottom: 4, left: 1, right: 4 }}>
          <defs>
            <linearGradient id={`spark-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={PALETTE.gold} stopOpacity={0.28} />
              <stop offset="100%" stopColor={PALETTE.gold} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={['dataMin', 'dataMax']} />
          <Area
            type="monotone"
            dataKey="y"
            stroke={PALETTE.gold}
            strokeWidth={2}
            fill={`url(#spark-${gid})`}
            connectNulls
            dot={false}
            // A single emphasized endpoint dot on the most-recent point.
            activeDot={false}
            isAnimationActive={!reduce}
            animationDuration={900}
            label={({ x, y, index }) =>
              index === lastIndex ? (
                <circle
                  key="spark-endpoint"
                  cx={x}
                  cy={y}
                  r={2.6}
                  fill={PALETTE.gold}
                  stroke="#fff"
                  strokeWidth={1}
                />
              ) : null
            }
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
