// ─────────────────────────────────────────────────────────────────────────────
// DriversList — AIC Phase I. WHY this school is where it is on the list.
//
// THE RULE THIS COMPONENT EXISTS TO ENFORCE (spec §2.6, §7.1): a rank with no
// stated driver is a number a superintendent can neither act on nor challenge.
// The server guarantees `1 <= drivers.length <= 3` on EVERY ranked row — so an
// empty `drivers` array is not an empty state, it is a DEFECT, and it renders as
// a visible defect marker. `return null` on empty would hide exactly the failure
// the invariant exists to catch: the row would still show a band and a score,
// with the justification silently gone.
//
// EVERY WORD HERE IS THE SERVER'S. `label` and `detail` are frozen deterministic
// templates composed API-side against figures that appear on the row itself
// (spec PURE-5 asserts that property). This component composes no sentence, so
// there is no path by which the screen can name a figure the payload does not
// carry.
//
// The contribution bar is aria-hidden and carries NO text: it is a relative
// visual weight derived from `contributionBp`, and printing that basis-point
// figure as a percentage would put a number on screen that means something
// different from every other percentage on the row.
// ─────────────────────────────────────────────────────────────────────────────
import { AlertTriangle } from 'lucide-react'

/** The visible defect marker. Never a blank cell, never null. */
export function DriverDefectMarker() {
  return (
    <span
      role="alert"
      className="inline-flex items-center gap-1.5 rounded-md border border-danger/50 bg-danger/10 px-2 py-1 text-[11.5px] font-semibold text-danger"
    >
      <AlertTriangle size={12} aria-hidden />
      No driver stated — this ranking cannot be explained
    </span>
  )
}

export default function DriversList({ drivers = [], max = 3, dense = false }) {
  const rows = Array.isArray(drivers) ? drivers.filter(Boolean) : []
  if (rows.length === 0) return <DriverDefectMarker />

  const shown = rows.slice(0, max)
  const widest = shown.reduce(
    (m, d) => (Number.isFinite(d?.contributionBp) ? Math.max(m, d.contributionBp) : m),
    0,
  )

  // Tailwind class names are never built by interpolation — the JIT scans source
  // TEXT, and a computed class silently drops out of the build.
  return (
    <ul className={dense ? 'space-y-1' : 'space-y-1.5'}>
      {shown.map((d, i) => {
        const bp = Number.isFinite(d?.contributionBp) ? d.contributionBp : 0
        // Relative weight only, in px, via an inline style (a data-driven width
        // can never be a utility class).
        const width = widest > 0 ? Math.max(4, Math.round((bp / widest) * 26)) : 4
        return (
          <li key={`${d.component ?? 'driver'}-${i}`} className="min-w-0 pl-4">
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                className="-ml-4 h-[3px] shrink-0 rounded-full bg-gold/70"
                style={{ width: `${width}px` }}
              />
              <span className="text-[12.5px] font-semibold leading-snug text-navy">{d.label}</span>
            </div>
            {d.detail && <p className="text-[12px] leading-snug text-muted">{d.detail}</p>}
          </li>
        )
      })}
    </ul>
  )
}
