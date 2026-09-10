export const CATEGORICAL_LIGHT = ['#2563EB', '#D97706', '#059669', '#E11D48', '#0891B2', '#7C3AED', '#EA580C', '#4F46E5']
export const CATEGORICAL_DARK = ['#3B82F6', '#D97706', '#059669', '#F43F5E', '#0891B2', '#8B5CF6', '#EA580C', '#6366F1']
export const DEEMPH = '#C4CCDF'
export { CHROME } from '../charts/palette.js'
export function schoolColor(seriesIndex, surface = 'light') { const pal = surface === 'dark' ? CATEGORICAL_DARK : CATEGORICAL_LIGHT; return seriesIndex >= 0 && seriesIndex < pal.length ? pal[seriesIndex] : DEEMPH }
// The validated heat-map steps (one hue for magnitude; blue ↔ red through grey for polarity) — one source, re-exported.
export { SEQUENTIAL_STEPS, DIVERGING_STEPS, DIVERGING_POS, DIVERGING_NEG, DIVERGING_MID } from '../charts/heatScales.js'
