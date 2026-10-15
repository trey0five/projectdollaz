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
import { ArrowRight, Compass, Lightbulb, Target } from 'lucide-react'
import { AuroraEmpty, AuroraLightButton, AuroraSection, AuroraTile, AuroraTileGrid } from '../ui/aurora/index.js'
import { TEMPLATE_LABELS, OWNER_ROLE_LABELS, recommendationId } from './improvementMeta.js'

const BASIS_LABEL = {
  nextStepLift: 'one rubric step',
  fullLift: 'full marks',
}

/**
 * One recommendation as an Aurora tile: what kind of step it is and the
 * standards it serves (kicker), the step itself (title), the engine's own
 * rationale (one line), the attributed lift as the big figure — or, when the
 * engine has no number, its literal reason and NO figure — and the one action.
 */
function RecommendationCard({ rec, canEdit, onWork }) {
  // The standard codes ride the kicker only when the title does not already
  // name them ("Raise COG-1 one rubric level" needs no second "COG-1").
  const tags = (rec.standardTags ?? []).slice(0, 3)
  const titleNamesTags = tags.length > 0 && tags.every((t) => String(rec.title ?? '').includes(t))
  const kicker = [TEMPLATE_LABELS[rec.templateId] ?? 'Recommended', ...(titleNamesTags ? [] : tags)].join(' · ')
  const hasLift = !!rec.estimatedLift && rec.estimatedLift.points != null
  const owner = rec.suggestedOwnerRole ? (OWNER_ROLE_LABELS[rec.suggestedOwnerRole] ?? rec.suggestedOwnerRole) : null
  return (
    <AuroraTile
      data-testid="recommendation"
      className="imp-rec"
      icon={hasLift ? Target : Lightbulb}
      kicker={kicker}
      title={rec.title}
      figure={hasLift ? `+${rec.estimatedLift.points}` : null}
      unit={hasLift ? ' points' : null}
      desc={rec.rationale}
      tip={hasLift ? `${rec.rationale} (Attributed to ${BASIS_LABEL[rec.estimatedLift.basis] ?? rec.estimatedLift.basis}.)` : undefined}
      art={false}
      foot={
        <>
          {owner ? <span className="imp-rec-owner">Owner · {owner}</span> : null}
          {canEdit ? (
            <AuroraLightButton size="sm" onClick={() => onWork?.(rec)} icon={<ArrowRight size={15} aria-hidden="true" />}>
              Work this gap
            </AuroraLightButton>
          ) : null}
        </>
      }
    >
      {/* No number is available — say why, in the engine's own words. */}
      {!hasLift && rec.estimatedLiftReason ? (
        <p className="imp-rec-reason" data-testid="lift-reason">
          {rec.estimatedLiftReason}
        </p>
      ) : null}
    </AuroraTile>
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
  return <AuroraEmpty data-testid="rail-empty" icon={Compass} text={headline} sub={detail} />
}

export default function RecommendationRail({
  recommendations = [],
  canEdit = false,
  onWork,
  loading = false,
  degraded = false,
  basis = null,
}) {
  const n = recommendations.length
  return (
    <AuroraSection
      first
      aria-labelledby="improvement-recommendations"
      icon={Lightbulb}
      title={<span id="improvement-recommendations">What to work on next</span>}
      subtitle={canEdit ? 'Turn a gap into owned, dated work' : 'An owner or accountant can start this work.'}
      count={n > 0 ? `${n} idea${n === 1 ? '' : 's'}` : null}
    >
      {loading && n === 0 ? (
        <AuroraEmpty icon={Compass} text="Reading your readiness gaps and open warnings…" aria-busy="true" />
      ) : degraded ? (
        <AuroraEmpty icon={Compass} text="Recommendations are unavailable right now. Your initiatives below are unaffected." />
      ) : n === 0 ? (
        <EmptyRail basis={basis} />
      ) : (
        <AuroraTileGrid cols={n >= 3 ? 3 : 2}>
          {recommendations.map((rec) => (
            <RecommendationCard key={recommendationId(rec)} rec={rec} canEdit={canEdit} onWork={onWork} />
          ))}
        </AuroraTileGrid>
      )}
    </AuroraSection>
  )
}
