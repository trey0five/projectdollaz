// ─────────────────────────────────────────────────────────────────────────────
// visitDates — ONE rendering of an observation date, on every Mock Visit surface.
//
// The screen and the paper are the two halves of this phase, and they were
// printing the SAME basis row two different ways: `/accreditation/visit` rendered
// `2026-06-30` raw while `/accreditation/visit/print` rendered `Jun 30, 2026`
// through a `fmtDay` helper that had been copied into three separate files. A
// reader comparing the screen against the document they just printed would see two
// dates for one reading and have no way to know they were the same one.
//
// THE VALUE IS ALWAYS THE SERVER'S. This formats; it never parses a partial date,
// never substitutes today for a missing one, and never shifts a civil date across
// a timezone — `formatShortDate` splits the ISO day itself for exactly that
// reason. Anything that is not a bare `YYYY-MM-DD` is passed through UNCHANGED
// rather than guessed at, because a date we cannot read is a fact about the
// reading.
// ─────────────────────────────────────────────────────────────────────────────
import { formatShortDate } from '../../lib/format.js'

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

/** ISO day → "Jun 30, 2026". Falsy → em dash. Unrecognised → itself, verbatim. */
export function fmtDay(iso) {
  if (!iso) return '—'
  const day = String(iso).slice(0, 10)
  return ISO_DAY.test(day) ? formatShortDate(day) : String(iso)
}

export default fmtDay
