// ─────────────────────────────────────────────────────────────────────────────
// ACT 4 — "What they'd ask for."
//
// THE EVIDENCE INDEX ALREADY EXISTS (Phase C) AND IS NOT REBUILT HERE. This act
// hands the carried-through `groups` / `health` / `counts` to
// `EvidenceReadinessTable` — the same component the Accreditation page's Evidence
// tab renders — and points at `/accreditation/evidence/print`, the page a school
// actually hands a visiting team.
//
// Rows are NOT re-sorted, re-worded or re-derived. `health.basis` is a
// server-composed sentence and the table already prints it verbatim. A second
// evidence renderer here would be a second answer to "is this artifact current",
// and currency is precisely the thing a visiting team checks.
//
// `indexRoute` is a plain string constant on the payload, not a link the server
// composes — so the screen and the printed preview point at the same page without
// either of them inventing a route.
//
// THE "SERVES" CHIPS GO SOMEWHERE. `EvidenceReadinessTable` renders one chip per
// standard an artifact serves, and on the Accreditation page each is wired to
// `scrollToStandard`. This act shipped without a handler, so the identical chip
// rendered as a hover-highlighted button that did nothing — the same control,
// live on one surface and dead on the other. It now deep-links through the
// `?center=` vocabulary `basisLinks.js` already uses, which is the ONLY navigation
// this file performs and composes no sentence.
// ─────────────────────────────────────────────────────────────────────────────
import { useNavigate } from 'react-router-dom'
import EvidenceReadinessTable from '../EvidenceReadinessTable.jsx'

/** The Evidence Index page, which already exists. Used when the payload omits it. */
export const EVIDENCE_INDEX_ROUTE = '/accreditation/evidence/print'

/** The register a "Serves" chip opens. One place, so screen and spec agree. */
export function standardHref(standardId) {
  return `/accreditation?center=standards&standard=${encodeURIComponent(standardId)}`
}

export default function ActRequests({ requests = null, framework = null, onOpenStandard = null }) {
  const navigate = useNavigate()
  const openStandard =
    onOpenStandard ?? ((standardId) => navigate(standardHref(standardId)))
  // The evidence-index read FAILED. Its own frozen sentence, verbatim — never an
  // empty requirement list, which would read as "a team would ask for nothing".
  if (requests?.unavailableReason) {
    return (
      <p
        data-testid="requests-unavailable"
        className="rounded-xl border border-[#F59E0B]/40 bg-amber-50 px-3 py-2 text-[12.5px] leading-relaxed text-amber-900"
      >
        {requests.unavailableReason}
      </p>
    )
  }
  return (
    <EvidenceReadinessTable
      health={requests?.health ?? null}
      counts={requests?.counts ?? null}
      groups={requests?.groups ?? []}
      framework={framework}
      printHref={requests?.indexRoute ?? EVIDENCE_INDEX_ROUTE}
      onOpenStandard={openStandard}
    />
  )
}
