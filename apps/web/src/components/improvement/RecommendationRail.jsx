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
import { ArrowRight } from 'lucide-react'
import { Section, Pill, Button } from '../ui/surface/index.js'
import '../../styles/pending/b1-domain.css'
import { TEMPLATE_LABELS, OWNER_ROLE_LABELS, recommendationId } from './improvementMeta.js'

const BASIS_LABEL = {
  nextStepLift: 'one rubric step',
  fullLift: 'full marks',
}

function LiftChip({ lift }) {
  if (!lift || lift.points == null) return null
  return (
    <Pill
      variant="status"
      tone="good"
      className="tabular-nums"
      title={`Attributed to ${BASIS_LABEL[lift.basis] ?? lift.basis}`}
    >
      +{lift.points} index pts
    </Pill>
  )
}

/** One recommendation: a ruled row on the ground (no card, no shadow). */
function RecommendationCard({ rec, index, canEdit, onWork, reduce }) {
  const kicker = TEMPLATE_LABELS[rec.templateId] ?? 'Recommended'
  const hasLift = !!rec.estimatedLift && rec.estimatedLift.points != null
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: reduce ? 0 : Math.min(index * 0.03, 0.2), duration: 0.28 }}
      className="flex flex-col gap-1.5 py-3.5"
      data-testid="recommendation"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="pg-eyebrow !mb-0">{kicker}</span>
        {(rec.standardTags ?? []).slice(0, 3).map((t) => (
          <span key={t} className="text-[11px] font-semibold text-ink2">
            {t}
          </span>
        ))}
        <span className="flex-1" />
        {hasLift ? <LiftChip lift={rec.estimatedLift} /> : null}
      </div>

      <p className="text-[14px] font-semibold leading-snug text-ink">{rec.title}</p>
      <p className="max-w-prose text-[12.5px] leading-relaxed text-ink2">{rec.rationale}</p>

      {/* No number is available — say why, in the engine's own words. */}
      {!hasLift && rec.estimatedLiftReason ? (
        <p className="border-l-2 border-hair pl-2.5 text-[12px] leading-relaxed text-ink2" data-testid="lift-reason">
          {rec.estimatedLiftReason}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {rec.suggestedOwnerRole ? (
          <span className="text-[12px] text-ink2">
            Suggested owner ·{' '}
            <span className="font-semibold text-ink">
              {OWNER_ROLE_LABELS[rec.suggestedOwnerRole] ?? rec.suggestedOwnerRole}
            </span>
          </span>
        ) : null}
        <span className="flex-1" />
        {canEdit ? (
          <Button size="sm" onClick={() => onWork?.(rec)} icon={<ArrowRight size={13} aria-hidden />}>
            Work this gap
          </Button>
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
    <div className="b1-empty" data-testid="rail-empty">
      <p className="b1-empty-title">{headline}</p>
      {detail ? <p>{detail}</p> : null}
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
    <Section
      aria-labelledby="improvement-recommendations"
      className="!mt-0"
      label={<span id="improvement-recommendations">What to work on next</span>}
      aside={!canEdit ? <span>An owner or accountant can start this work.</span> : null}
    >
      {loading && recommendations.length === 0 ? (
        <p className="text-[13px] text-ink2">Reading your readiness gaps and open warnings…</p>
      ) : degraded ? (
        <div className="b1-empty">
          <p>Recommendations are unavailable right now. Your initiatives below are unaffected.</p>
        </div>
      ) : recommendations.length === 0 ? (
        <EmptyRail basis={basis} />
      ) : (
        <ul className="grid gap-x-10 lg:grid-cols-2 [&>li]:border-b [&>li]:border-hair">
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
    </Section>
  )
}
