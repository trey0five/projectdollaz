// ─────────────────────────────────────────────────────────────────────────────
// palette.js — the FROZEN fixed-order categorical series palette for analytics v2
// charts (LOCKED CONTRACT §RESOLVED). Charts NEVER choose their own color; the hue
// is always passed IN as a prop. ENG-IA assigns a stable hue per ENTITY by roster
// index (seriesIndex = index in schools[] = palette order), so a re-sort never
// recolors survivors. Order: A #2563EB · B #D97706 · C #7C3AED · D #059669 ·
// E #E11D48, cycling past 5 (dataviz allows a cycle only past the fixed theme).
//
// The `SERIES_PALETTE` / `DEEMPH` / `seriesColor` exports are the seam ENG-IA
// already codes against — kept verbatim. The `PALETTE` / `PALETTE_BY_KEY` /
// `colorAt` aliases mirror the contract's naming. `CHROME` holds the recessive
// chart-furniture colors (grid/axis/ink) so this library is self-contained and
// never depends on tokens.css (untouched in Phase D).
// ─────────────────────────────────────────────────────────────────────────────

export const SERIES_PALETTE = ['#2563EB', '#D97706', '#7C3AED', '#059669', '#E11D48']

// Single de-emphasis grey for "context"/deemph series (dimmed line + label).
export const DEEMPH = '#C4CCDF'

/** Color for series index i (cycles past the 5 base colors). */
export function seriesColor(i) {
  const n = SERIES_PALETTE.length
  return SERIES_PALETTE[(((i % n) + n) % n)]
}

// ── Contract-named aliases (same values, different handles) ──────────────────
export const PALETTE = SERIES_PALETTE
export const PALETTE_BY_KEY = {
  A: '#2563EB',
  B: '#D97706',
  C: '#7C3AED',
  D: '#059669',
  E: '#E11D48',
}
export const colorAt = seriesColor

// ── Chrome tokens (recessive chart furniture — NEVER a series color) ─────────
// Literal hex ported from the mockup engine. Text/ink use these, never a series
// color (dataviz non-negotiable). `--ink` fallback lets the app token win when set.
export const CHROME = {
  grid: '#E9EEF9', //  hairline grid / rings / spokes (1px)
  axis: '#6B7694', //  axis tick + label ink
  ink: 'var(--ink, #101C3D)', //  primary data-label ink
  inkSoft: '#3D4A6B', //  secondary value ink
  dim: DEEMPH, //  de-emphasized stroke/fill
  dimText: '#8A93AC', //  de-emphasized label ink
  crosshair: '#C9D3EA', //  line-chart crosshair
  ring: '#FFFFFF', //  marker ring
  gaugeTrack: '#DBEAFE', //  arc-gauge unfilled track
  gaugeFrom: '#2563EB', //  arc-gauge gradient start
  gaugeTo: '#38BDF8', //  arc-gauge gradient end (blue→cyan)
}
