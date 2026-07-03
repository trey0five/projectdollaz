import { useId } from 'react'
import { useReducedMotion } from 'framer-motion'
import { ResponsiveContainer, AreaChart, Area, YAxis, ReferenceLine } from 'recharts'
import { PALETTE } from '../../lib/metricMeta.js'

// Status → stroke, matching STATUS_META (good=gold, watch=navy-soft, risk=danger).
// Absent/neutral status keeps the original gold treatment (backward-compatible for
// callers that pass only `points`).
const STATUS_STROKE = {
  good: '#b89650',
  watch: '#2e508f',
  risk: '#8b1a1a',
  neutral: PALETTE.gold,
}

/**
 * Per-card trend, redrawn as an integrated presence rather than a corner
 * thumbnail: an area chart STATUS-COLORED to the metric's band (a critical metric
 * reads red at a glance) with the band THRESHOLD drawn as a dashed reference line,
 * so you see how far the value sits from the boundary it must not cross. A glowing
 * endpoint dot marks the latest point. `points` are TrendPoints; nulls (unavailable
 * periods) are skipped via connectNulls.
 *
 * Optional props (default → the legacy gold, no-threshold sparkline):
 *   status         'good' | 'watch' | 'risk' | 'neutral' — colors the stroke/fill
 *   threshold      numeric band boundary to draw as a dashed reference line
 *   thresholdLabel short caption rendered at the line (e.g. the formatted boundary)
 *   height         chart height in px (default 40; the cards pass a taller value)
 */
export default function Sparkline({
  points,
  status,
  threshold = null,
  thresholdLabel,
  height = 40,
}) {
  const reduce = useReducedMotion()
  const gid = useId().replace(/:/g, '') // recharts/SVG ids can't contain ':'
  const color = STATUS_STROKE[status] ?? PALETTE.gold
  const data = (points ?? [])
    .filter((p) => p.value != null)
    .map((p) => ({ x: p.periodEndDate, y: p.value }))

  if (data.length < 2) {
    // Placeholder (no trend yet). The card foot is full-bleed (negative margins),
    // so pad it back in — otherwise the italic copy sits flush to the rounded
    // bottom/left edges and reads as cropped. minHeight (not a fixed height) lets
    // it wrap to a second line without clipping.
    return (
      <div
        className="flex items-center px-3 pb-3 pt-1 text-[12.5px] italic leading-snug text-muted sm:px-4 sm:pb-4"
        style={{ minHeight: height }}
      >
        Trend builds as you save more periods
      </div>
    )
  }

  const lastIndex = data.length - 1

  // Expand the y-domain to include the threshold so its reference line is visible,
  // with a little breathing room so the stroke never rides the top/bottom edge.
  const ys = data.map((d) => d.y)
  const showThreshold = threshold != null && Number.isFinite(threshold)
  const lo = Math.min(...ys, showThreshold ? threshold : Infinity)
  const hi = Math.max(...ys, showThreshold ? threshold : -Infinity)
  const pad = (hi - lo) * 0.15 || 1
  const domain = [lo - pad, hi + pad]

  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 6, bottom: 2, left: 0, right: 0 }}>
          <defs>
            <linearGradient id={`spark-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.26} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YAxis hide domain={domain} />
          {showThreshold && (
            <ReferenceLine
              y={threshold}
              stroke={color}
              strokeDasharray="3 3"
              strokeOpacity={0.5}
              label={
                thresholdLabel
                  ? {
                      value: thresholdLabel,
                      position: 'insideBottomRight',
                      fontSize: 9,
                      fill: color,
                      opacity: 0.75,
                    }
                  : undefined
              }
            />
          )}
          <Area
            type="monotone"
            dataKey="y"
            stroke={color}
            strokeWidth={2}
            fill={`url(#spark-${gid})`}
            connectNulls
            dot={false}
            activeDot={false}
            isAnimationActive={!reduce}
            animationDuration={900}
            label={({ x, y, index }) =>
              index === lastIndex ? (
                <circle
                  key="spark-endpoint"
                  cx={x}
                  cy={y}
                  r={2.8}
                  fill={color}
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
