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
// ─────────────────────────────────────────────────────────────────────────────
import { CalendarDays, Gauge, ScanSearch } from 'lucide-react'

/** Frozen. The qualifier that keeps a projection from reading as an outcome. */
export const BAND_QUALIFIER = 'Projected band'

/**
 * One half of the pair. `value` is a percentage the SERVER computed; it is
 * rendered, never derived, and a null renders an em dash rather than a 0.
 */
function Half({ label, value, meaning }) {
  return (
    <div className="min-w-[9rem] flex-1 rounded-2xl border border-rule/60 bg-cream/40 px-3.5 py-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className="mt-0.5 font-serif text-[26px] font-semibold leading-none text-navy">
        {typeof value === 'number' ? `${value}%` : '—'}
      </p>
      <p className="mt-1 text-[11.5px] leading-snug text-muted">{meaning}</p>
    </div>
  )
}

export default function ActArrival({ arrival = null, demoData = false }) {
  if (!arrival) return null

  const band = typeof arrival.band === 'string' ? arrival.band : null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full border border-navy/20 bg-navy/5 px-3 py-1 text-[12.5px] font-semibold text-navy">
          {arrival.frameworkLabel}
        </span>
        {band ? (
          <span
            data-testid="arrival-band"
            className="rounded-full border border-rule/60 bg-section px-3 py-1 text-[12.5px] font-semibold text-muted"
          >
            {/* The qualifier is ours; the label is the framework's, verbatim — no
                `capitalize`, which would re-case "Accredited with Merit" into
                "Accredited With Merit" and quietly re-write an accreditor's term. */}
            {BAND_QUALIFIER} · <span className="text-navy">{band}</span>
          </span>
        ) : null}
        {demoData ? (
          <span className="rounded-full border border-rule/60 bg-section px-3 py-1 text-[12px] font-semibold text-muted">
            demonstration data
          </span>
        ) : null}
      </div>

      {/* SCOPED, AND SAYING SO. A mock visit reads exactly ONE framework; a school
          holding two used to be told how it looked "to an accreditor" with no hint
          that half its register was outside the read. The sentence is composed
          server-side beside the framework it qualifies, never here. */}
      {arrival.alsoHoldsLine ? (
        <p
          data-testid="arrival-also-holds"
          className="rounded-xl border border-navy/15 bg-navy/[0.04] px-3 py-2 text-[12.5px] leading-relaxed text-muted"
        >
          {arrival.alsoHoldsLine}
        </p>
      ) : null}

      {/* The readiness read FAILED. Its own frozen sentence, verbatim — never an
          em dash pretending to be "nothing scored yet". */}
      {arrival.unavailableReason ? (
        <p
          data-testid="arrival-unavailable"
          className="rounded-xl border border-[#F59E0B]/40 bg-amber-50 px-3 py-2 text-[12.5px] leading-relaxed text-amber-900"
        >
          {arrival.unavailableReason}
        </p>
      ) : null}

      {/* The pair. Always both, always labelled, never one alone. */}
      <div className="flex flex-wrap gap-2.5">
        <Half
          label="Documented"
          value={arrival.documented}
          meaning="What the school has scored itself against the rubric."
        />
        <Half
          label="Defensible"
          value={arrival.defensible}
          meaning="What current evidence would stand behind on the day."
        />
        <div className="min-w-[9rem] flex-1 rounded-2xl border border-rule/60 bg-cream/40 px-3.5 py-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            Projected index
          </p>
          <p className="mt-0.5 font-serif text-[26px] font-semibold leading-none text-navy">
            {typeof arrival.projectedIndex === 'number' ? arrival.projectedIndex : '—'}
          </p>
          <p className="mt-1 text-[11.5px] leading-snug text-muted">
            The mean rubric score, on the framework&apos;s own scale.
          </p>
        </div>
      </div>

      {/* Both sentences arrive composed. Printed verbatim, never re-worded. */}
      <div className="space-y-1.5">
        {arrival.asOfLine ? (
          <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-muted">
            <CalendarDays size={14} className="mt-[2px] shrink-0 text-navy/60" aria-hidden />
            <span>{arrival.asOfLine}</span>
          </p>
        ) : null}
        {arrival.evaluableLine ? (
          <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-muted">
            <ScanSearch size={14} className="mt-[2px] shrink-0 text-[#F59E0B]" aria-hidden />
            <span>{arrival.evaluableLine}</span>
          </p>
        ) : null}
        {arrival.confidence?.caveat ? (
          <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-muted">
            <Gauge size={14} className="mt-[2px] shrink-0 text-[#F59E0B]" aria-hidden />
            <span>{arrival.confidence.caveat}</span>
          </p>
        ) : null}
      </div>
    </div>
  )
}
