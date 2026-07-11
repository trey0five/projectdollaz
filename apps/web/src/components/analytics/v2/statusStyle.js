// ─────────────────────────────────────────────────────────────────────────────
// statusStyle — the analytics-v2 semantic STATUS visual vocabulary, in one place.
// Two surfaces, one meaning:
//   • DARK (the navy hero band): the tile's soft glow ring — at-risk red, watch
//     amber, on-track CALM BLUE (not neon, never a celebration green on dark),
//     plus the sparkline hue that matches the glow.
//   • LIGHT (rows, cells): pills / dots / band-rails in the readable trio —
//     emerald (on track), amber (watch), red (at risk); slate for contextual.
// Classes resolve to analytics-v2.css (`.av2-tile-*`, `.av2-pill-*`, `.av2-rail-*`)
// so no comma'd arbitrary Tailwind shadows are needed (dev-JIT gotcha).
// Status semantics stay the registry's: good | watch | risk | neutral.
// ─────────────────────────────────────────────────────────────────────────────

const DARK = {
  good: { ring: 'ring-1 ring-sky-400/30', tile: 'av2-tile av2-tile-good', spark: '#60A5FA' },
  watch: { ring: 'ring-1 ring-amber-400/40', tile: 'av2-tile av2-tile-watch', spark: '#FBBF24' },
  risk: { ring: 'ring-1 ring-red-400/40', tile: 'av2-tile av2-tile-risk', spark: '#F87171' },
  neutral: { ring: 'ring-1 ring-white/10', tile: 'av2-tile av2-tile-neutral', spark: '#94A3B8' },
}

const LIGHT = {
  good: { pill: 'av2-pill av2-pill-good', dot: '#10B981', rail: 'av2-rail-good', label: 'On track' },
  watch: { pill: 'av2-pill av2-pill-watch', dot: '#F59E0B', rail: 'av2-rail-watch', label: 'Watch' },
  risk: { pill: 'av2-pill av2-pill-risk', dot: '#EF4444', rail: 'av2-rail-risk', label: 'At risk' },
  neutral: { pill: 'av2-pill av2-pill-neutral', dot: '#94A3B8', rail: 'av2-rail-neutral', label: 'Contextual' },
}

/** Dark-hero tokens for a metric status (defaults to neutral). */
export function darkStatus(status) {
  return DARK[status] ?? DARK.neutral
}

/** Light-surface tokens for a metric status (defaults to neutral). */
export function lightStatus(status) {
  return LIGHT[status] ?? LIGHT.neutral
}

/** Delta-chip classes per semantic tone (deltaTone output), one per surface. */
export const DELTA_CHIP_DARK = {
  good: 'bg-emerald-400/15 text-emerald-300',
  bad: 'bg-red-400/15 text-red-300',
  neutral: 'bg-white/10 text-slate-300',
}
export const DELTA_CHIP_LIGHT = {
  good: 'bg-emerald-500/10 text-emerald-700',
  bad: 'bg-red-500/10 text-red-600',
  neutral: 'bg-slate-100 text-slate-500',
}
