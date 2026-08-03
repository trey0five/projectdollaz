// ─────────────────────────────────────────────────────────────────────────────
// AIC Phase H §4.5 — THE MANDATORY NON-AFFILIATION FOOTER.
//
// ONE component, used by all four accreditation-bearing print surfaces:
//
//   · /accreditation/board/print     (Board Readiness One-Pager, Phase H)
//   · /accreditation/visit/print     (Visiting-Team Preview, Phase H)
//   · /accreditation/evidence/print  (Evidence Index, Phase C — footer swapped)
//   · /governance/report/print       (Governance Report — footer swapped)
//
// It renders three things, in this order, and is NEVER `no-print`:
//   1. the disclaimer sentence, VERBATIM, exactly as the server sent it;
//   2. "Generated <date>" (+ "· demonstration data" when the payload says so);
//   3. Phase B's ConfidenceCaveat — reused, never re-worded.
//
// WHY THE SENTENCE IS A PROP AND NOT A CONSTANT HERE.
// Phase H found the disclaimer FORKED: `READINESS_DISCLAIMER`
// (apps/api/src/accreditation/readiness-history.service.ts) said "Cognia, MSA-CESS
// or WCEA" while `EVIDENCE_INDEX_DISCLAIMER` in the web said "Cognia / MSA /
// WCEA", and the Evidence Index printed BOTH of them, one after the other. The
// server constant is now the only disclaimer in the product; the web declares the
// sentence NOWHERE, which is why this component cannot have a default and why a
// spec asserts the string appears in no `apps/web/src` source file.
//
// WHY A MISSING DISCLAIMER THROWS.
// A print page whose disclaimer prop silently resolves to undefined renders a
// document that claims accreditation purpose and disclaims nothing — the single
// misreading this whole program exists to prevent — and it does so while looking
// completely fine in a diff, in review, and on screen. `return null` would make
// that failure invisible; throwing makes the caller's bug loud at the exact line
// that caused it. Every caller already guards: the footer is only mounted once
// the payload that carries the sentence has loaded, and a page that cannot read a
// disclaimer renders its "could not load" state (or drops its accreditation
// claim) rather than mounting this component without one.
// ─────────────────────────────────────────────────────────────────────────────
import { ConfidenceCaveat } from '../ConfidenceChip.jsx'
import { formatShortDate } from '../../../lib/format.js'

/**
 * ISO → "Jun 30, 2026". Anything falsy → em dash. Never today, never a guess.
 * The same idiom the other print pages use; duplicated here rather than imported
 * from a page module so the footer has no dependency on any one surface.
 */
export function printDay(iso) {
  if (!iso) return '—'
  const day = String(iso).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? formatShortDate(day) : day
}

// NOTE ON THE EMPTY-PLAN CASE, which an earlier cut of this file owned.
// `plan.items: []` is three different states and only one is good news, so it
// needs three different sentences — but they are the COMPOSER'S
// (`VISIT_PLAN_NO_FRAMEWORK` / `VISIT_PLAN_NOT_LICENSED` / `VISIT_PLAN_ALL_ADOPTED`,
// surfaced as `acts.plan.emptyReason`). The print pages render that field
// verbatim. No print surface composes an honesty sentence of its own.

export default function VisitPrintFooter({
  disclaimer,
  generatedAt = null,
  demoData = false,
  confidence = null,
  className = '',
}) {
  const sentence = typeof disclaimer === 'string' ? disclaimer.trim() : ''
  if (!sentence) {
    // Loud on purpose. See the header block.
    throw new Error(
      'VisitPrintFooter: `disclaimer` is required. A print page must never leave the ' +
        'building without the non-affiliation sentence — render your "could not load" ' +
        'state instead of mounting this footer.',
    )
  }

  return (
    <footer
      data-testid="visit-print-footer"
      className={`mt-7 space-y-2 border-t border-rule pt-3 ${className}`}
    >
      {/* The server's sentence, verbatim. NOT `no-print`. */}
      <p data-testid="visit-print-disclaimer" className="text-[10.5px] leading-relaxed text-muted">
        {disclaimer}
      </p>
      <p className="text-[10.5px] text-muted">
        Generated {printDay(generatedAt)}
        {demoData ? ' · demonstration data' : ''}
      </p>
      <ConfidenceCaveat confidence={confidence} className="!text-[10.5px]" />
    </footer>
  )
}
