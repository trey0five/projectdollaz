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

/**
 * Labels for the two ENDS of a date axis — the year is shown whenever the
 * reader needs it to read the span.
 *
 * A trend axis that prints only "Oct 1" … "Oct 17" makes a five-year line read
 * like seventeen days (seen live on the enrollment trend: Oct 1, 2022 → Oct 17,
 * 2026). So:
 *   • the span crosses a calendar year → BOTH ends carry their year
 *     ("Oct 1, 2022" … "Oct 17, 2026");
 *   • the span sits inside one year → the first end stays compact and the last
 *     end carries the year once ("Aug 3" … "Aug 14, 2026").
 * An end that cannot be parsed comes back as its raw input (or null when empty)
 * so a bad row never prints "Invalid Date". UTC-safe — no timezone drift.
 *
 * @param {string} firstIso yyyy-mm-dd (or ISO timestamp) of the first point
 * @param {string} lastIso  yyyy-mm-dd (or ISO timestamp) of the last point
 * @returns {[string|null, string|null]}
 */
export function axisEndLabels(firstIso, lastIso) {
  const parse = (iso) => {
    if (!iso) return null
    const d = new Date(`${String(iso).slice(0, 10)}T00:00:00.000Z`)
    return Number.isNaN(d.getTime()) ? null : d
  }
  const a = parse(firstIso)
  const b = parse(lastIso)
  const fmt = (d, withYear) =>
    d.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      ...(withYear ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    })
  const raw = (iso) => (iso ? String(iso) : null)
  // When either end is unreadable we cannot know whether the span crosses a
  // year — so the readable end always carries its year.
  const crosses = !a || !b || a.getUTCFullYear() !== b.getUTCFullYear()
  return [a ? fmt(a, crosses) : raw(firstIso), b ? fmt(b, true) : raw(lastIso)]
}
