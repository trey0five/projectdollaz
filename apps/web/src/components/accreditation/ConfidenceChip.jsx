// ─────────────────────────────────────────────────────────────────────────────
// ConfidenceChip / ConfidenceCaveat — Phase B: THE PUBLISHED SIZE OF THE HOLE.
//
// A domain grid that quietly shows five cards with numbers and five without is a
// grid that flatters. So the coverage figure travels WITH the grid, in two places
// and one voice:
//
//   · ConfidenceChip   — the small amber-outline pill on the navy readiness hero,
//                        under the Documented / Defensible pair. It is the first
//                        thing read on the page, so it is where "we are basing
//                        this on 5 of 10 domains" has to be said.
//   · ConfidenceCaveat — the light one-line footer under the Domains grid. It is
//                        deliberately NOT `no-print`: the caveat has to survive
//                        window.print(), because a printed grid handed to a board
//                        without its coverage line is the exact misreading this
//                        phase exists to prevent.
//
// Both render the server's `caveat` sentence VERBATIM. It is composed by the pure
// computeDomainConfidence in @finrep/compliance from the actual coverage shape
// (nothing adopted / nothing measured / partly measured / all measured, plus any
// unmapped standards). Nothing here rewrites, shortens or softens it, and nothing
// here computes a percentage — nulls render as no chip at all rather than a 0%.
//
// ONE source of truth for this copy: Phase C's Evidence Index print page reuses
// ConfidenceCaveat rather than re-wording it.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'
import { Gauge } from 'lucide-react'

const TOTAL_DOMAINS = 10

/** True when the payload carries a usable coverage reading. */
function hasReading(confidence) {
  return (
    confidence != null &&
    typeof confidence.coveragePct === 'number' &&
    typeof confidence.measuredDomains === 'number'
  )
}

/**
 * The navy-hero pill. Amber outline on glass, sized to sit under ProvenancePair.
 * `title` and `aria-label` both carry the full caveat so the sentence is available
 * to a pointer and to a screen reader without the pill having to grow.
 */
export function ConfidenceChip({ confidence = null, reduce = false }) {
  if (!hasReading(confidence)) return null
  const caveat = confidence.caveat ?? ''
  // ZERO MEASURED DOMAINS IS A LEGITIMATE, CORRECT OUTCOME — an MSA-CESS school
  // has five root leaves and reaches MIN_DOMAIN_LEAVES in none of the ten
  // domains, by design. But "Domain coverage 0%" in an amber pill, with the
  // explanation living only in a hover `title`, reads as a failure of the school
  // or of KYRO — and hover does not survive a printout, a screenshot pasted into
  // a board deck, or a touch device. So at zero we drop the percentage entirely
  // (a percentage nobody can act on), go neutral rather than amber, and carry the
  // server's sentence VISIBLY underneath. This is the most-read point on the
  // page; the misreading this phase exists to prevent must not start here.
  const none = confidence.measuredDomains === 0
  return (
    <motion.span
      initial={reduce ? false : { opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.35, ease: 'easeOut' }}
      title={caveat}
      aria-label={caveat}
      className={`inline-flex max-w-full flex-col items-start gap-0.5 rounded-2xl border px-3 py-1 text-[12px] font-semibold ${
        none
          ? 'border-white/20 bg-white/[0.06] text-white/70'
          : 'border-[#F59E0B]/45 bg-[#F59E0B]/12 text-[#fde68a]'
      }`}
    >
      <span className="inline-flex items-center gap-1.5">
        <Gauge size={13} aria-hidden />
        {none ? (
          'Domain grid: not scored for this framework'
        ) : (
          <>
            Domain coverage {confidence.coveragePct}% · {confidence.measuredDomains} of{' '}
            {TOTAL_DOMAINS}
          </>
        )}
      </span>
      {none && caveat ? (
        <span className="max-w-[46ch] text-[11.5px] font-normal leading-relaxed text-white/50">
          {caveat}
        </span>
      ) : null}
    </motion.span>
  )
}

/**
 * The light footer line under the Domains grid (and, from Phase C, the Evidence
 * Index print page). Plain text, prints as-is, no motion, no truncation.
 */
export function ConfidenceCaveat({ confidence = null, className = '' }) {
  if (!hasReading(confidence)) return null
  return (
    <p
      className={`flex items-start gap-2 text-[12.5px] leading-relaxed text-muted ${className}`}
    >
      <Gauge size={14} className="mt-[2px] shrink-0 text-[#F59E0B]" aria-hidden />
      <span>
        {/* Same rule as the hero pill: at zero measured domains a bare "0%" is
            a number nobody can act on, so the state is named instead. */}
        <span className="font-semibold text-navy">
          {confidence.measuredDomains === 0
            ? 'Domain grid: not scored for this framework'
            : `Domain coverage ${confidence.coveragePct}%`}
        </span>
        {confidence.caveat ? ` — ${confidence.caveat}` : null}
      </span>
    </p>
  )
}

export default ConfidenceChip
