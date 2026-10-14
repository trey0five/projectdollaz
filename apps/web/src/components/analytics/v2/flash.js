// flash.js — the cross-link landing pulse. Scrolls a target (a chart Section by
// anchorId, or a Scorecard DataTable ROW by row id) into view and toggles
// [data-flash="on"] for one beat. The pulse itself is CSS in surface.css:
// `tr[data-flash='on'] > td` washes the row's cells primary-blue once (a <tr>
// cannot carry a box-shadow ring), `.sec[data-flash='on']` rings the section.
// Reduced-motion gets an instant scroll + the static tint the CSS provides.
// Returns a cleanup that clears any pending timer.
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
  const t = window.setTimeout(() => el.removeAttribute('data-flash'), 1300)
  return () => window.clearTimeout(t)
}
