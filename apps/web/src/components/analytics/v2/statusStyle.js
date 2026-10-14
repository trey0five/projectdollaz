// ─────────────────────────────────────────────────────────────────────────────
// statusStyle — the analytics-v2 semantic STATUS vocabulary, in one place.
// Premium UI P3: colour is the plan's semantic trio (good #15803D · watch
// #B45309 · risk #B91C1C — tokens.css --c-good/--c-watch/--c-risk) and it lives
// ONLY in a 2px mark (Stat mark, DataTable mark column, Pill status mark); the
// text stays ink. `tone` is the Pill / Stat / DataTable tone name.
//   • LIGHT (rows, rails, marks): dot = the mark colour; tone; label.
//   • DARK (the two P4-owned stages): the frosted `.av2-tile` class + a
//     sparkline hue that reads on ink.
// Status semantics stay the registry's: good | watch | risk | neutral.
// ─────────────────────────────────────────────────────────────────────────────

const DARK = {
  good: { tile: 'av2-tile av2-tile-good', spark: '#60A5FA' },
  watch: { tile: 'av2-tile av2-tile-watch', spark: '#FBBF24' },
  risk: { tile: 'av2-tile av2-tile-risk', spark: '#F87171' },
  neutral: { tile: 'av2-tile av2-tile-neutral', spark: '#94A3B8' },
}

const LIGHT = {
  good: { tone: 'good', dot: '#15803D', label: 'On track' },
  watch: { tone: 'watch', dot: '#B45309', label: 'Watch' },
  risk: { tone: 'risk', dot: '#B91C1C', label: 'At risk' },
  neutral: { tone: 'neutral', dot: '#44506E', label: 'Contextual' },
}

/** Dark-stage tokens for a metric status (defaults to neutral). */
export function darkStatus(status) {
  return DARK[status] ?? DARK.neutral
}

/** Light-surface tokens for a metric status (defaults to neutral). */
export function lightStatus(status) {
  return LIGHT[status] ?? LIGHT.neutral
}

/** deltaTone() output ('good' | 'bad' | 'neutral') → a Pill status tone. */
export const DELTA_TONE = { good: 'good', bad: 'risk', neutral: 'neutral' }
/** Registry status → the Stat / DataTable 2px mark tone (neutral draws none). */
export const MARK = { good: 'good', watch: 'watch', risk: 'risk' }
