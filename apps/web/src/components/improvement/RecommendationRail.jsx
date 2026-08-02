// ─────────────────────────────────────────────────────────────────────────────
// RecommendationRail — the "what should we work on next" rail on /improvement.
//
// Every sentence and every numeral here is SERVER-COMPOSED by the pure
// improvement-findings module, which copies `nextStepLift`/`fullLift` verbatim
// from the readiness engine and refuses to state an index gain it cannot
// attribute. This component therefore COMPOSES NOTHING:
//   · `rationale` is printed verbatim;
//   · the lift chip renders ONLY when `estimatedLift` is non-null, and it prints
//     `estimatedLift.points` — it never rounds a null into a zero, never scales,
//     never derives;
//   · when `estimatedLift` is null the frozen `estimatedLiftReason` sentence is
//     printed INSTEAD, so the absence of a number is explained rather than hidden.
// An evidence-only or assurance recommendation genuinely moves no index point;
// printing "+0 pts" there would be a fabricated statistic wearing the engine's
// authority, which is the exact failure mode the honesty spec pins.
//
// The one action is "Work this gap", which hands the recommendation to the page's
// seeded RecordFlow. It is shown only to editors — a viewer sees the reasoning and
// a plain sentence about who can act, never a dead button.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'
import { ArrowRight, Lightbulb, Sparkles } from 'lucide-react'
import { IMPROVEMENT_HUE, TEMPLATE_LABELS, OWNER_ROLE_LABELS, hueAlpha, recommendationId } from './improvementMeta.js'

const BASIS_LABEL = {
  nextStepLift: 'one rubric step',
  fullLift: 'full marks',
}

function LiftChip({ lift }) {
  if (!lift || lift.points == null) return null
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1 rounded-full border px-2.5 py-1 text-[12px] font-bold"
      style={{ borderColor: hueAlpha(0.4), background: hueAlpha(0.1), color: '#0f766e' }}
      title={`Attributed to ${BASIS_LABEL[lift.basis] ?? lift.basis}`}
    >
      +{lift.points} index pts
    </span>
  )
}

function RecommendationCard({ rec, index, canEdit, onWork, reduce }) {
  const kicker = TEMPLATE_LABELS[rec.templateId] ?? 'Recommended'
  const hasLift = !!rec.estimatedLift && rec.estimatedLift.points != null
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: reduce ? 0 : Math.min(index * 0.04, 0.2), duration: 0.28 }}
      className="flex flex-col gap-2 rounded-xl border border-rule/50 bg-white p-3.5 shadow-sm"
      data-testid="recommendation"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="rounded-md px-1.5 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.08em]"
          style={{ background: hueAlpha(0.12), color: '#0f766e' }}
        >
          {kicker}
        </span>
        {(rec.standardTags ?? []).slice(0, 3).map((t) => (
          <span
            key={t}
            className="rounded-md border border-rule/60 bg-cream/60 px-1.5 py-0.5 text-[10.5px] font-semibold text-muted"
          >
            {t}
          </span>
        ))}
        <span className="flex-1" />
        {hasLift ? <LiftChip lift={rec.estimatedLift} /> : null}
      </div>

      <p className="text-[14px] font-semibold leading-snug text-navy">{rec.title}</p>
      <p className="text-[12.5px] leading-relaxed text-muted">{rec.rationale}</p>

      {/* No number is available — say why, in the engine's own words. */}
      {!hasLift && rec.estimatedLiftReason ? (
        <p
          className="rounded-lg border border-dashed border-rule/60 bg-cream/50 px-2.5 py-1.5 text-[12px] leading-relaxed text-muted"
          data-testid="lift-reason"
        >
          {rec.estimatedLiftReason}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {rec.suggestedOwnerRole ? (
          <span className="text-[12px] text-muted">
            Suggested owner ·{' '}
            <span className="font-semibold text-navy">
              {OWNER_ROLE_LABELS[rec.suggestedOwnerRole] ?? rec.suggestedOwnerRole}
            </span>
          </span>
        ) : null}
        <span className="flex-1" />
        {canEdit ? (
          <button
            type="button"
            onClick={() => onWork?.(rec)}
            className="inline-flex items-center gap-1.5 rounded-full btn-cta px-3.5 py-1.5 text-[12.5px] font-semibold transition"
          >
            Work this gap <ArrowRight size={13} aria-hidden />
          </button>
        ) : null}
      </div>
    </motion.li>
  )
}

/**
 * AN EMPTY RAIL IS NOT ONE FACT, so it does not get one sentence.
 *
 * "Every open gap, unmet assurance and non-informational warning is already
 * being worked" is a positive claim about work that was EVALUATED. It is false
 * for a strategy-only school (the accreditation sources are never read — the
 * page rides on accreditation OR strategy) and false for a school that has not
 * adopted a framework yet (there are no gaps or assurances to be clear of). The
 * server says which case this is in `basis`; when it says nothing, the wording
 * falls back to the one claim that is always true — nothing to show.
 */
function EmptyRail({ basis }) {
  const licensed = basis?.accreditationLicensed
  const framework = basis?.frameworkAdopted
  let headline = 'Nothing to recommend right now.'
  let detail = null
  if (licensed === false) {
    headline = 'Recommendations come from Accreditation.'
    detail =
      'This school licenses Strategic Planning, so readiness gaps and early warnings are not evaluated here. Your initiatives below are unaffected.'
  } else if (licensed === true && framework === false) {
    headline = 'No framework adopted yet.'
    detail =
      'Adopt your accreditor’s framework on Accreditation and its gaps, assurance gates and early warnings start arriving here as work you can own.'
  } else if (licensed === true && framework === true) {
    headline = 'Nothing is waiting on a plan.'
    detail = 'Every open gap, unmet assurance and non-informational warning is already being worked.'
  }
  return (
    <div
      className="mt-3 rounded-xl border border-dashed border-rule/60 bg-cream/50 px-4 py-8 text-center"
      data-testid="rail-empty"
    >
      <p className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-navy">
        <Sparkles size={14} aria-hidden /> {headline}
      </p>
      {detail ? <p className="mt-1 text-[12.5px] text-muted">{detail}</p> : null}
    </div>
  )
}

export default function RecommendationRail({
  recommendations = [],
  canEdit = false,
  onWork,
  loading = false,
  degraded = false,
  basis = null,
  reduce = false,
}) {
  return (
    <section
      aria-labelledby="improvement-recommendations"
      className="rounded-2xl border-2 bg-white p-4 shadow-sm"
      style={{ borderColor: hueAlpha(0.25) }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-xl text-white"
          style={{ background: IMPROVEMENT_HUE }}
        >
          <Lightbulb size={16} aria-hidden />
        </span>
        <h2 id="improvement-recommendations" className="font-serif text-[17px] font-semibold text-navy">
          What to work on next
        </h2>
        <span className="flex-1" />
        {!canEdit ? (
          <span className="text-[12px] text-muted">An owner or accountant can start this work.</span>
        ) : null}
      </div>

      {loading && recommendations.length === 0 ? (
        <p className="mt-3 text-[13px] text-muted">Reading your readiness gaps and open warnings…</p>
      ) : degraded ? (
        <p className="mt-3 rounded-xl border border-dashed border-rule/60 bg-cream/50 px-4 py-6 text-center text-[13px] text-muted">
          Recommendations are unavailable right now. Your initiatives below are unaffected.
        </p>
      ) : recommendations.length === 0 ? (
        <EmptyRail basis={basis} />
      ) : (
        <ul className="mt-3 grid gap-2.5 lg:grid-cols-2">
          {recommendations.map((rec, i) => (
            <RecommendationCard
              key={recommendationId(rec)}
              rec={rec}
              index={i}
              canEdit={canEdit}
              onWork={onWork}
              reduce={reduce}
            />
          ))}
        </ul>
      )}
    </section>
  )
}
