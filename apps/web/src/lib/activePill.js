// Solid, high-contrast fill for a SELECTED status/option pill, keyed by the health
// palette (good / watch / risk / neutral). Replaces the old 10%-opacity chip tint
// that read as barely-selected. Shared by the checklist + CAP status selectors so
// every "which option is chosen" control looks the same.
// Shadows key off the theme tokens (tokens.css) so the pills follow the active
// ui theme; watch's rgba(37,52,96) matches no token and stays literal.
export const ACTIVE_PILL_CLS = {
  good: 'bg-gold text-white border-gold shadow-[0_3px_12px_-3px_rgb(var(--c-glow)/0.65)]',
  watch: 'bg-navy-soft text-white border-navy-soft shadow-[0_3px_12px_-3px_rgba(37,52,96,0.5)]',
  risk: 'bg-danger text-white border-danger shadow-[0_3px_12px_-3px_rgb(var(--c-danger)/0.5)]',
  neutral: 'bg-navy text-cream border-navy shadow-[0_3px_12px_-3px_rgb(var(--c-shade)/0.5)]',
}

export function activePillCls(palette) {
  return ACTIVE_PILL_CLS[palette] ?? ACTIVE_PILL_CLS.neutral
}
