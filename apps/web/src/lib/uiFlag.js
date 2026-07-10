// ui.v2 helpers that live OUTSIDE React. The flag itself is owned by
// context/UiFlagContext.jsx (readUiV2/setUiV2); this module holds the bridge
// for JS-held colors.
//
// readToken(name) reads a design token's CURRENT value off <html>, e.g.
//   readToken('c-navy')       -> "31 61 114"   (RGB channels — wrap in rgb())
//   readToken('grad-cta-2')   -> "#b89650"
// It is the migration path for chart palettes (lib/metricMeta.js PALETTE,
// Sparkline strokes, …) which still hold literal hexes today: Phase D rewires
// them through this so they follow the active theme. Values come from
// src/styles/tokens.css and therefore respect data-ui + .ui-v1 re-scopes when
// read off the relevant element.
export function readToken(name, el = document.documentElement) {
  const prop = name.startsWith('--') ? name : `--${name}`
  return getComputedStyle(el).getPropertyValue(prop).trim()
}
