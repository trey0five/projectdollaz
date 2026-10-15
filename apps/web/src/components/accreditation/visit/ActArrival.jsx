// ─────────────────────────────────────────────────────────────────────────────
// ACT 1 — "The team is here."
//
// The opening frame: which framework, what the school has DOCUMENTED, what it can
// DEFEND, what the projected index and band are, what date the evidence is as of,
// and how much of the rule catalog could be evaluated at all.
//
// THE DOCUMENTED / DEFENSIBLE VOCABULARY IS PHASE A'S AND IS NOT NEGOTIABLE. A
// single "readiness %" is the number this whole program exists to stop shipping:
// it lets a school that has self-scored everything and evidenced nothing read a
// large number and believe it. The pair is always rendered together, always
// labelled, and neither half is ever shown alone.
//
// `asOfLine` and `evaluableLine` are SERVER-COMPOSED sentences and are printed
// verbatim — that is why the composer is allowed to write them (they are about the
// assessment, not about a finding) and why this component is not. In particular
// `evaluableLine` names how many rules ran out of how many; this file never
// renders `coverage.evaluablePct` as a bare number, because a bare "83%" invites
// the reader to treat coverage as a grade.
//
// A null half of the pair renders an em dash, NEVER a zero. "Nothing scored yet"
// and "scored at zero" are different facts.
//
// THE BAND IS A PROJECTION AND IS LABELLED AS ONE. `arrival.band` is
// `bandForIndex(framework.statusBands, projectedIndex)`, and under Cognia those
// bands are the literal accreditation status labels — "Accredited", "Accredited
// with Merit", "Accredited with Distinction". Rendered as a bare status badge in
// the chip row it reads as an accreditation OUTCOME; it is a band over a projected
// index derived from self-scores in which an unscored leaf counts as 1. Every
// other surface qualifies it (the ReadinessHero puts it inside the projected-index
// dome, the one-pager makes it the `sub` of the "Projected index" stat, the print
// preview labels the field "Band"), so this one does too.
//
// THERE IS NO TONE MAP. The one that used to live here was keyed on
// `clear|watch|elevated|high|critical` — the TWIN's risk-band vocabulary, not this
// field's — so no real band value ever matched and every production band fell
// through to the neutral fallback. A colour map that silently never fires is worse
// than none: it reads, in a diff, as though the band were being toned by severity.
// Nothing on this pill infers good or bad from an accreditor's own wording.
//
// PREMIUM UI P4 (a2): the pair and the index are a StatStrip (vertical rules,
// figures count up once; a null is the Stat's em dash, never a zero), the chips
// are ledger Pills, and the server's sentences are ruled notes with a 2px mark
// instead of amber washes.
// ─────────────────────────────────────────────────────────────────────────────
import { CalendarDays, Gauge, ScanSearch } from 'lucide-react'
import { Pill, Stat, StatStrip } from '../../ui/surface/index.js'
import '../../../styles/pending/a2-carry.css'

/** Frozen. The qualifier that keeps a projection from reading as an outcome. */
export const BAND_QUALIFIER = 'Projected band'

/**
 * A server figure for a Stat: integers count up, anything else (a decimal index,
 * null) is handed over as-is — a null becomes the Stat's em dash, never a zero,
 * and a decimal is never rounded by the count-up.
 */
function figure(v) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  return Number.isInteger(v) ? v : String(v)
}

export default function ActArrival({ arrival = null, demoData = false }) {
  if (!arrival) return null

  const band = typeof arrival.band === 'string' ? arrival.band : null
  const documented = figure(arrival.documented)
  const defensible = figure(arrival.defensible)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Pill>{arrival.frameworkLabel}</Pill>
        {band ? (
          <Pill data-testid="arrival-band">
            {/* The qualifier is ours; the label is the framework's, verbatim — no
                `capitalize`, which would re-case "Accredited with Merit" into
                "Accredited With Merit" and quietly re-write an accreditor's term. */}
            <span className="font-medium text-ink2">{BAND_QUALIFIER} ·</span> {band}
          </Pill>
        ) : null}
        {demoData ? <Pill className="text-ink2">demonstration data</Pill> : null}
      </div>

      {/* SCOPED, AND SAYING SO. A mock visit reads exactly ONE framework; a school
          holding two used to be told how it looked "to an accreditor" with no hint
          that half its register was outside the read. The sentence is composed
          server-side beside the framework it qualifies, never here. */}
      {arrival.alsoHoldsLine ? (
        <p data-testid="arrival-also-holds" className="a2-note">
          {arrival.alsoHoldsLine}
        </p>
      ) : null}

      {/* B2 — THE REVIEW-DAY RISK, server-composed (visit.service attaches it
          off the readiness payload's unbackedIndexPoints): how many projected
          index points rest on scores with no evidence attached. The same fact
          the hero's risk chip names, printed verbatim in the opening frame —
          null (zero/unmeasurable) renders nothing, suppressed is not zero. */}
      {arrival.unbackedRiskLine ? (
        <p data-testid="arrival-unbacked-risk" className="a2-note" data-tone="watch">
          {arrival.unbackedRiskLine}
        </p>
      ) : null}

      {/* The readiness read FAILED. Its own frozen sentence, verbatim — never an
          em dash pretending to be "nothing scored yet". */}
      {arrival.unavailableReason ? (
        <p data-testid="arrival-unavailable" className="a2-note" data-tone="watch">
          {arrival.unavailableReason}
        </p>
      ) : null}

      {/* The pair. Always both, always labelled, never one alone. */}
      <StatStrip cols={3} className="border-t border-hair">
        <Stat
          label="Documented"
          value={documented}
          unit={documented != null ? '%' : undefined}
          note="What the school has scored itself against the rubric."
        />
        <Stat
          label="Defensible"
          value={defensible}
          unit={defensible != null ? '%' : undefined}
          note="What current evidence would stand behind on the day."
        />
        <Stat
          label="Projected index"
          value={figure(arrival.projectedIndex)}
          note="The mean rubric score, on the framework's own scale."
        />
      </StatStrip>

      {/* Both sentences arrive composed. Printed verbatim, never re-worded. */}
      <div className="space-y-1.5">
        {arrival.asOfLine ? (
          <p className="flex items-start gap-2 text-small leading-relaxed text-ink2">
            <CalendarDays size={14} className="mt-[2px] shrink-0" aria-hidden />
            <span>{arrival.asOfLine}</span>
          </p>
        ) : null}
        {arrival.evaluableLine ? (
          <p className="flex items-start gap-2 text-small leading-relaxed text-ink2">
            <ScanSearch size={14} className="mt-[2px] shrink-0" aria-hidden />
            <span>{arrival.evaluableLine}</span>
          </p>
        ) : null}
        {arrival.confidence?.caveat ? (
          <p className="flex items-start gap-2 text-small leading-relaxed text-ink2">
            <Gauge size={14} className="mt-[2px] shrink-0" aria-hidden />
            <span>{arrival.confidence.caveat}</span>
          </p>
        ) : null}
      </div>
    </div>
  )
}
