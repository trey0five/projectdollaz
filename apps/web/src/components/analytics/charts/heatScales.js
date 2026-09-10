// ─────────────────────────────────────────────────────────────────────────────
// heatScales — the ONE set of stepped colour scales every heat map reads.
//
// Three grids share this file (academics grade × subject, academics cohort ×
// subject, enrollment grade × year), and before it each rolled its own
// continuous alpha ramp: −14 and −4 barely differed, the ink flipped from navy
// to white in the one band where NEITHER cleared contrast, and the same tint
// meant a different magnitude after every filter change because the domain was
// re-derived from the worst cell on screen.
//
// RULES THIS FILE KEEPS (dataviz skill, validated with validate_palette.js):
//   • Sequential = ONE hue, light → dark, discrete steps. Sky 400→950, five
//     steps; validator --ordinal ALL PASS (monotone L, adjacent ΔL ≥ 0.06,
//     light end 2.14:1 on white, hue spread 10°).
//   • Diverging = TWO hues + a NEUTRAL grey midpoint. Blue ↔ red — a warm/cool
//     pair that survives protan/deutan simulation (poles ΔE 24.2 protan; the
//     lightest arm pair ΔE 12.3 protan, legal because every cell also prints
//     its signed figure) — NOT the red/green pair this replaces. Each arm's
//     first step sits a full ΔL ≥ 0.06 off the neutral grey, so "level" and
//     "one gap ahead" never read as the same tint.
//   • Every step carries its own ink, chosen so the cell figure clears WCAG AA
//     (≥ 4.5:1) on that exact fill. The 500/600 steps of each ramp are skipped
//     on purpose: they are the band where neither navy nor white ink passes,
//     which is exactly where the old continuous ramps flipped.
//   • The domain is STABLE: the diverging scale steps by multiples of the
//     family's material gap (the canonical "a difference under N points is not
//     a difference" rule the rest of academics already prints), and the
//     sequential scale snaps its top to a nice number so a filter change never
//     silently repaints a cell.
//   • Suppressed (<5) and absent are two different facts and two different
//     surfaces: an amber hatch (the enrollment convention) versus a barely-there
//     grey. Neither is ever a colour step.
// ─────────────────────────────────────────────────────────────────────────────

/** Cell ink — text tokens only; never a series colour. */
export const HEAT_INK = { dark: '#101C3D', light: '#FFFFFF' }

/** Sequential, one hue (sky), five steps light → dark. */
export const SEQUENTIAL_STEPS = Object.freeze([
  { fill: '#38BDF8', ink: HEAT_INK.dark },
  { fill: '#0EA5E9', ink: HEAT_INK.dark },
  { fill: '#0369A1', ink: HEAT_INK.light },
  { fill: '#0C4A6E', ink: HEAT_INK.light },
  { fill: '#082F49', ink: HEAT_INK.light },
])

/** Diverging arms, index 0 = one gap off neutral … 3 = four or more gaps. */
export const DIVERGING_POS = Object.freeze([
  { fill: '#93C5FD', ink: HEAT_INK.dark },
  { fill: '#60A5FA', ink: HEAT_INK.dark },
  { fill: '#2563EB', ink: HEAT_INK.light },
  { fill: '#1E40AF', ink: HEAT_INK.light },
])
export const DIVERGING_NEG = Object.freeze([
  { fill: '#FCA5A5', ink: HEAT_INK.dark },
  { fill: '#F87171', ink: HEAT_INK.dark },
  { fill: '#DC2626', ink: HEAT_INK.light },
  { fill: '#991B1B', ink: HEAT_INK.light },
])
/** The neutral midpoint — grey, never a hue. */
export const DIVERGING_MID = Object.freeze({ fill: '#E2E8F0', ink: HEAT_INK.dark })

/** The full diverging strip, negative pole → neutral → positive pole. */
export const DIVERGING_STEPS = Object.freeze([...DIVERGING_NEG].reverse().concat([DIVERGING_MID], DIVERGING_POS))

/** The darkest ink of each arm — for legend glyphs (▲ ▼) beside text. */
export const DIVERGING_INK = Object.freeze({ pos: '#1E40AF', neg: '#991B1B', mid: '#475569' })

/** Withheld to protect fewer than five children: hatched, amber, labelled. */
export const SUPPRESSED_STYLE = Object.freeze({
  color: '#B45309',
  background: 'repeating-linear-gradient(135deg, rgba(180,83,9,0.14) 0 5px, rgba(180,83,9,0.04) 5px 10px)',
  boxShadow: 'inset 0 0 0 1px rgba(180,83,9,0.28)',
})

/** Never filed: barely there, and a different mark from a small reading. */
export const ABSENT_STYLE = Object.freeze({
  color: '#94A3B8',
  background: 'rgba(16,28,61,0.03)',
})

/** The smallest "nice" number ≥ v (1 · 1.5 · 2 · 2.5 · 3 · 4 · 5 · 6 · 8 · 10 × 10ⁿ). */
export function niceCeil(v) {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return 0
  const mag = 10 ** Math.floor(Math.log10(n))
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) {
    const c = m * mag
    if (c >= n - 1e-9) return Number(c.toPrecision(12))
  }
  return 10 * mag
}

const num = (v) => (v === null || v === undefined || !Number.isFinite(Number(v)) ? null : Number(v))

/**
 * A sequential scale over [0, top] where `top` is the nice ceiling of `max`.
 * Six equal steps; `stepFor(value)` returns the step (fill + ink + bounds) or
 * null when there is no number to place.
 */
export function sequentialScale(max, { steps = SEQUENTIAL_STEPS } = {}) {
  const top = niceCeil(max)
  const n = steps.length
  const width = top > 0 ? top / n : 1
  const list = steps.map((s, i) => ({ ...s, index: i, lo: width * i, hi: width * (i + 1) }))
  const indexFor = (value) => {
    const v = num(value)
    if (v === null || top <= 0) return null
    return Math.max(0, Math.min(n - 1, Math.floor(v / width)))
  }
  return {
    kind: 'sequential',
    top,
    width,
    steps: list,
    ticks: list.map((s) => s.lo).concat([top]),
    indexFor,
    stepFor: (value) => {
      const i = indexFor(value)
      return i === null ? null : list[i]
    },
  }
}

/**
 * A diverging scale stepped by multiples of `gap` — the family's material gap.
 * |delta| < gap is neutral ("level"); each further gap is one step darker, up
 * to `arms` steps. When the server has already ruled on `direction`
 * ('gained' | 'declined' | 'held'), that ruling wins over the sign — tone from
 * direction, never from sign — and the magnitude only sets the intensity.
 */
export function divergingScale(gap, { arms = 4, pos = DIVERGING_POS, neg = DIVERGING_NEG, mid = DIVERGING_MID } = {}) {
  const g = num(gap)
  const unit = g !== null && g > 0 ? g : 1
  const k = Math.max(1, Math.min(arms, pos.length, neg.length))
  const mkArm = (arm, sign) =>
    arm.slice(0, k).map((s, i) => ({
      ...s,
      sign,
      k: i + 1,
      lo: unit * (i + 1) * (sign > 0 ? 1 : -1),
      hi: i + 1 < k ? unit * (i + 2) * (sign > 0 ? 1 : -1) : null, // null = open-ended
    }))
  const posSteps = mkArm(pos, 1)
  const negSteps = mkArm(neg, -1)
  const midStep = { ...mid, sign: 0, k: 0, lo: -unit, hi: unit }
  const strip = [...negSteps].reverse().concat([midStep], posSteps)

  const stepFor = (delta, direction) => {
    const d = num(delta)
    if (direction === 'held') return midStep
    if (d === null) return null
    let sign = direction === 'gained' ? 1 : direction === 'declined' ? -1 : Math.abs(d) < unit ? 0 : Math.sign(d)
    if (sign === 0) return midStep
    const idx = Math.max(1, Math.min(k, Math.floor(Math.abs(d) / unit))) - 1
    return sign > 0 ? posSteps[idx] : negSteps[idx]
  }

  // Boundary ticks, pole → pole: −k·g … −g, +g … +k·g (k+1 per side, 2k total).
  const ticks = []
  for (let i = k; i >= 1; i--) ticks.push(-unit * i)
  for (let i = 1; i <= k; i++) ticks.push(unit * i)

  return { kind: 'diverging', gap: unit, arms: k, steps: strip, mid: midStep, pos: posSteps, neg: negSteps, ticks, stepFor }
}
