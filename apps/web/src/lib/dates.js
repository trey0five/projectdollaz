// ─────────────────────────────────────────────────────────────────────────────
// dates — tiny shared date-formatting helpers for the web app.
// ─────────────────────────────────────────────────────────────────────────────

/** Short "Jul 6" date from a yyyy-mm-dd string (UTC-safe, no tz drift). */
export function shortDate(iso) {
  if (!iso) return null
  const d = new Date(`${iso.slice(0, 10)}T00:00:00.000Z`)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}
