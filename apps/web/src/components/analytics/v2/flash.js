// flash.js — the cross-link landing pulse. Scrolls a target (a ChartCard by
// anchorId, or a Scorecard row by row id) into view and toggles [data-flash="on"]
// for one beat (the av2-flashring keyframe in analytics-v2.css). Reduced-motion
// gets an instant scroll + the static ring the CSS already provides. Returns a
// cleanup that clears any pending timer.
export function flashElement(id, reduce) {
  if (typeof document === 'undefined' || !id) return () => {}
  const el = document.getElementById(id)
  if (!el) return () => {}
  try {
    el.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' })
  } catch {
    el.scrollIntoView()
  }
  el.setAttribute('data-flash', 'on')
  const t = window.setTimeout(() => el.removeAttribute('data-flash'), 1200)
  return () => window.clearTimeout(t)
}
