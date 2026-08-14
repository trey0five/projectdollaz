// ─────────────────────────────────────────────────────────────────────────────
// chartKit — the shared vocabulary every academics chart draws with.
//
// THREE RULES, and they are what separate these from stock charts.
//
// 1. FOCUS ASYMMETRY. The school you are signed in to is rendered richly —
//    gradient fill, outer glow, a larger endpoint. Every peer is quiet grey.
//    The old charts drew all three schools identically, so the reader had to
//    hunt for themselves in their own dashboard before the chart could say
//    anything. Emphasis IS the message here.
//
// 2. FIT THE DATA, NOT THE THEORY. A percentile axis pinned to 1–99 spends most
//    of its height on range nobody occupies, which is why several of these
//    charts were two-thirds empty. Scales are computed from the values present,
//    padded, and clamped to the theoretical range only at the edges.
//
// 3. MOTION THAT DIRECTS READING. Bars grow, lines draw left to right, the
//    endpoint lands last. That order is the sentence — where we were, where we
//    went, where we are — so the animation is doing work rather than decorating.
//    All of it collapses to a static frame under prefers-reduced-motion.
// ─────────────────────────────────────────────────────────────────────────────

export const HUE = '#0D9488'
export const EASE = [0.2, 0.8, 0.2, 1]

/** Focus teal, peer slate, and the two reference colours, in one place. */
export const INK = {
  focus: HUE,
  focusLight: '#2DD4BF',
  peer: '#94A3B8',
  peerSoft: '#CBD5E1',
  national: '#E11D48',
  network: '#2563EB',
  ahead: '#059669',
  behind: '#E11D48',
  grid: 'rgba(16,28,61,0.07)',
}

/**
 * The <defs> every chart shares: two gradients and a glow.
 *
 * `id` namespaces them, because two charts on one page with the same gradient id
 * silently share whichever mounted last — a real bug, and an invisible one.
 */
export function ChartDefs({ id, hue = HUE }) {
  return (
    <defs>
      <linearGradient id={`${id}-focus`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={hue} stopOpacity="0.95" />
        <stop offset="100%" stopColor={INK.focusLight} stopOpacity="1" />
      </linearGradient>
      <linearGradient id={`${id}-focus-v`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={INK.focusLight} stopOpacity="0.38" />
        <stop offset="100%" stopColor={hue} stopOpacity="0" />
      </linearGradient>
      <linearGradient id={`${id}-peer`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={INK.peerSoft} stopOpacity="0.85" />
        <stop offset="100%" stopColor={INK.peer} stopOpacity="0.7" />
      </linearGradient>
      <linearGradient id={`${id}-behind`} x1="1" y1="0" x2="0" y2="0">
        <stop offset="0%" stopColor="#FB7185" stopOpacity="0.95" />
        <stop offset="100%" stopColor={INK.behind} stopOpacity="1" />
      </linearGradient>
      <linearGradient id={`${id}-ahead`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#34D399" stopOpacity="0.95" />
        <stop offset="100%" stopColor={INK.ahead} stopOpacity="1" />
      </linearGradient>
      {/* A soft outer glow. Applied only to the focus mark, so it reads as
          "this one" rather than as a filter someone left switched on. */}
      <filter id={`${id}-glow`} x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="3.2" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
    </defs>
  )
}

/**
 * A scale fitted to the values, padded, then clamped to the family's own range.
 *
 * The percentile charts were drawn on 1–99 while every school sat between 58 and
 * 80, so four-fifths of the plot was empty and every real difference was
 * compressed into a sliver.
 */
export function fitScale(values, range, { pad = 0.18, includeZero = false } = {}) {
  const nums = values.filter((v) => v !== null && v !== undefined && Number.isFinite(v))
  if (nums.length === 0) return { lo: range?.min ?? 0, hi: range?.max ?? 100 }
  let lo = Math.min(...nums)
  let hi = Math.max(...nums)
  if (includeZero) {
    lo = Math.min(lo, 0)
    hi = Math.max(hi, 0)
  }
  const span = hi - lo || Math.max(1, Math.abs(hi) * 0.1)
  lo -= span * pad
  hi += span * pad
  if (range) {
    lo = Math.max(range.min, lo)
    hi = Math.min(range.max, hi)
  }
  return { lo, hi: hi > lo ? hi : lo + 1 }
}

/**
 * A diverging colour, cool through neutral to warm.
 *
 * The heat map used one red for every negative cell, so a grade 19 points behind
 * looked exactly like one 7 points behind — the chart's whole job, discriminating
 * between them, was the thing it did not do. Intensity now tracks magnitude
 * against the worst cell present.
 */
export function divergingFill(delta, worst = 20) {
  if (delta === null || delta === undefined) return { bg: 'rgba(16,28,61,0.04)', fg: '#94A3B8', ring: 'transparent' }
  const t = Math.min(1, Math.abs(delta) / Math.max(1, worst))
  if (Math.abs(delta) < 1.5) {
    return { bg: 'rgba(100,116,139,0.10)', fg: '#475569', ring: 'rgba(100,116,139,0.25)' }
  }
  const ahead = delta > 0
  const base = ahead ? '5,150,105' : '225,29,72'
  return {
    bg: `rgba(${base}, ${0.07 + t * 0.24})`,
    fg: ahead ? '#047857' : '#BE123C',
    ring: `rgba(${base}, ${0.2 + t * 0.4})`,
  }
}

/** A pill-labelled reference rule — used for the national and network lines. */
export function ReferenceRule({ x, top, bottom, color, label, side = 'right' }) {
  return (
    <g>
      <line x1={x} x2={x} y1={top} y2={bottom} stroke={color} strokeWidth="1.5" strokeDasharray="5 4" opacity="0.85" />
      <g transform={`translate(${x + (side === 'right' ? 5 : -5)}, ${top + 9})`}>
        <text
          fontSize="9"
          fontWeight="700"
          fill={color}
          textAnchor={side === 'right' ? 'start' : 'end'}
          style={{ letterSpacing: '0.02em' }}
        >
          {label}
        </text>
      </g>
    </g>
  )
}

/** Label text that never overlaps its neighbour: nudge each one clear. */
export function spreadLabels(points, minGap = 13) {
  const sorted = [...points].sort((a, b) => a.y - b.y)
  for (let i = 1; i < sorted.length; i++) {
    const gap = sorted[i].y - sorted[i - 1].y
    if (gap < minGap) sorted[i].y = sorted[i - 1].y + minGap
  }
  return points
}

/** Trim a school name to something that fits beside a dot. */
export function shortName(name, max = 16) {
  const n = String(name ?? '')
    .replace(/\b(High School|School|Academy|Catholic|Senior|Sr)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const s = n || String(name ?? '')
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}
