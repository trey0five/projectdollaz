// ─────────────────────────────────────────────────────────────────────────────
// HealthRail — one metric, on a scale you can actually read.
//
// WHAT IT REPLACED. The peer view drew each metric as unlabelled rows: a school
// name, a hairline, a dot, a number. A dot's position means nothing without a
// domain, so the picture carried no information at all — and the only thing said
// in words was a rank ("100th pctile"), which at one peer just meant "you won".
//
// TWO QUESTIONS, ONE PICTURE. A head of school asks "how do we compare?" and
// "are we OK?", and the second one matters more: −0.5 months of operating
// reserve is alarming whether or not it beats the school down the road. So the
// rail shows the health bands as the ground, and everybody's value as dots
// standing on it. Comparison is the spacing between dots; health is where they
// stand. Neither requires a distribution, so this reads identically with one
// peer or fifty.
//
// BANDS ARE OPTIONAL AND NEVER INVENTED. Cost per pupil deliberately has no
// sector band — spending levels follow mission — so it renders as a plain rail.
// A metric with no agreed healthy range must not be given one for symmetry.
//
// The domain is NOT assumed to start at zero: months of reserve goes negative,
// and a rail that clamped at 0 would put a real deficit at the left edge and
// call it the floor.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { CHROME } from './palette.js'
import { useMeasuredWidth } from './useMeasuredWidth.js'
import { useReducedMotion } from './useReducedMotion.js'

const H = 74
const PAD_X = 14
const RAIL_Y = 30
const RAIL_H = 9

/**
 * A value is treated as off the scale only when it dwarfs everything else on the
 * chart by this factor. RELATIVE TO THE OTHER VALUES, deliberately — an earlier
 * version measured against the band width and pushed a 19.2% operating margin
 * off the rail, because that band is 0–3% wide and an excellent margin is many
 * multiples of it. Excellent is not the same as absurd.
 */
const OUTLIER_RATIO = 12

/** Band tints — the light-surface status vocabulary (statusStyle.js LIGHT). */
const ZONE = {
  risk: { fill: '#EF4444', op: 0.16, label: 'At risk' },
  watch: { fill: '#F59E0B', op: 0.16, label: 'Watch' },
  good: { fill: '#10B981', op: 0.16, label: 'Healthy' },
}

const FOCUS_COLOR = '#FF6B5E' // --c-coral, the focus school throughout v2
const PEER_COLOR = '#94A3B8'

/**
 * Direction-aware zones across [lo,hi]. Mirrors TargetBandBar (MetricDrawer.jsx)
 * so the peer rail and the metric drawer can never disagree about where the
 * healthy range starts.
 */
function zonesFor(bands, lo, hi) {
  if (!bands || bands.good == null || bands.risk == null) return []
  return bands.goodDirection === 'lower'
    ? [
        { tone: 'good', from: lo, to: bands.good },
        { tone: 'watch', from: bands.good, to: bands.risk },
        { tone: 'risk', from: bands.risk, to: hi },
      ]
    : [
        { tone: 'risk', from: lo, to: bands.risk },
        { tone: 'watch', from: bands.risk, to: bands.good },
        { tone: 'good', from: bands.good, to: hi },
      ]
}

/**
 * @param points  [{ id, name, value, formatted, isFocus }] — every school with a
 *                value. Schools without one are the caller's problem to explain;
 *                a missing value is not a zero and must never be plotted as one.
 * @param bands   { good, risk, goodDirection } or null/undefined.
 * @param caption One plain sentence. The component does not compose it — the
 *                facts (rank, delta, band verdict) live with the data.
 */
export default function HealthRail({ points = [], bands = null, caption = null, ariaLabel }) {
  const reduce = useReducedMotion()
  const [hostRef, width] = useMeasuredWidth(520)

  const plot = useMemo(
    () => points.filter((p) => p && p.value != null && Number.isFinite(p.value)),
    [points],
  )

  const { lo, hi } = useMemo(() => {
    // The domain spans the DATA and the BAND EDGES together: a school far below
    // the risk threshold must still be visible on the same rail as the band it
    // is failing.
    //
    // ONE ABSURD SCHOOL MUST NOT DESTROY THE CHART. Real rosters contain
    // garbage — a school whose expenses parsed near zero reported 14,108 MONTHS
    // of operating reserve, which flattened every other school and the entire
    // healthy band into the first pixel of the rail. So the scale is anchored on
    // what the reader came to judge (this school's value and its healthy range)
    // and only stretches for peers within a generous multiple of that; anything
    // beyond is pinned to the edge and labelled as off the scale, which is both
    // readable AND more honest than a chart that silently flattens itself.
    const all = plot.map((p) => p.value)
    if (all.length === 0) return { lo: 0, hi: 1 }

    // The band edges always belong on the scale — the healthy range is the
    // ground the reader is judging against.
    const bandVals = []
    if (bands?.good != null) bandVals.push(bands.good)
    if (bands?.risk != null) bandVals.push(bands.risk)

    // Drop only values that DWARF the rest. `ref` is the largest magnitude among
    // everything else on the chart, so "excellent" survives and "absurd" does
    // not: a 19.2% margin beside a 16.4% one stays, a 14,108-month reserve
    // beside a 0.3 one goes.
    const keep = all.filter((v) => {
      const others = [...all.filter((o) => o !== v), ...bandVals].map(Math.abs)
      const ref = others.length ? Math.max(...others) : Math.abs(v)
      return !(ref > 0 && Math.abs(v) > ref * OUTLIER_RATIO)
    })
    const scale = [...(keep.length ? keep : all), ...bandVals]
    const rawLo = Math.min(...scale)
    const rawHi = Math.max(...scale)
    const span = rawHi - rawLo
    const pad = span > 0 ? span * 0.18 : Math.abs(rawHi) * 0.25 || 1
    return { lo: rawLo - pad, hi: rawHi + pad }
  }, [plot, bands])

  const innerW = Math.max(80, width - PAD_X * 2)
  const x = (v) => PAD_X + ((v - lo) / (hi - lo || 1)) * innerW
  const zones = zonesFor(bands, lo, hi)

  if (plot.length === 0) return null

  return (
    <div ref={hostRef} className="w-full">
      <svg
        viewBox={`0 0 ${width} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={ariaLabel}
        style={{ display: 'block', overflow: 'visible' }}
      >
        {/* The rail. Zones when the metric has an agreed healthy range; a plain
            track when it does not. */}
        <rect
          x={PAD_X}
          y={RAIL_Y}
          width={innerW}
          height={RAIL_H}
          rx={RAIL_H / 2}
          fill={CHROME.grid}
        />
        {zones.map((z) => {
          const zx = Math.max(PAD_X, x(z.from))
          const zw = Math.min(PAD_X + innerW, x(z.to)) - zx
          if (!(zw > 0)) return null
          return (
            <motion.rect
              key={z.tone}
              x={zx}
              y={RAIL_Y}
              height={RAIL_H}
              rx={RAIL_H / 2}
              fill={ZONE[z.tone].fill}
              fillOpacity={ZONE[z.tone].op}
              initial={reduce ? { width: zw } : { width: 0 }}
              animate={{ width: zw }}
              transition={{ duration: 0.5, ease: [0.22, 0.8, 0.2, 1] }}
            />
          )
        })}

        {/* The healthy-range boundary, named once rather than colour-coded only. */}
        {bands?.good != null && (
          <>
            <line
              x1={x(bands.good)}
              x2={x(bands.good)}
              y1={RAIL_Y - 5}
              y2={RAIL_Y + RAIL_H + 5}
              stroke="#10B981"
              strokeWidth={1.5}
              strokeDasharray="3 2"
              opacity={0.7}
            />
            <text
              x={x(bands.good)}
              y={RAIL_Y + RAIL_H + 17}
              textAnchor="middle"
              fontSize="10"
              fill="#0F766E"
              fontWeight="600"
            >
              healthy
            </text>
          </>
        )}

        {/* Every school, on the one scale. Peers first so the focus dot and its
            label always sit on top of them. */}
        {[...plot.filter((p) => !p.isFocus), ...plot.filter((p) => p.isFocus)].map((p, i) => {
          const off = p.value < lo || p.value > hi
          const cx = off
            ? p.value > hi
              ? PAD_X + innerW
              : PAD_X
            : x(p.value)
          const focus = !!p.isFocus
          return (
            <motion.g
              key={p.id}
              initial={reduce ? { opacity: 1 } : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.12 + i * 0.06, type: 'spring', stiffness: 300, damping: 22 }}
            >
              <circle
                cx={cx}
                cy={RAIL_Y + RAIL_H / 2}
                r={focus ? 8 : 5}
                fill={focus ? FOCUS_COLOR : PEER_COLOR}
                stroke="#fff"
                strokeWidth={focus ? 2.5 : 1.5}
              />
              <text
                x={cx}
                y={focus ? RAIL_Y - 10 : RAIL_Y - 8}
                textAnchor={off ? (p.value > hi ? 'end' : 'start') : 'middle'}
                fontSize={focus ? '13' : '11'}
                fontWeight={focus ? '700' : '500'}
                fill={focus ? '#0F172A' : CHROME.dimText ?? '#64748B'}
              >
                {/* Said, not hidden: the value is still printed, with a mark
                    showing it sits beyond the end of the scale. */}
                {off ? (p.value > hi ? `${p.formatted} ›` : `‹ ${p.formatted}`) : p.formatted}
              </text>
            </motion.g>
          )
        })}
      </svg>

      {/* Names below, so the chart above stays uncluttered and the legend reads
          left-to-right in value order. */}
      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
        {[...plot].sort((a, b) => a.value - b.value).map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1.5 text-[12px]">
            <span
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ background: p.isFocus ? FOCUS_COLOR : PEER_COLOR }}
            />
            <span className={p.isFocus ? 'font-semibold text-navy' : 'text-muted'}>
              {p.isFocus ? `${p.name} (you)` : p.name}
            </span>
          </span>
        ))}
      </div>

      {caption ? (
        <p className="mt-2 text-[13px] leading-snug text-muted">{caption}</p>
      ) : null}
    </div>
  )
}
