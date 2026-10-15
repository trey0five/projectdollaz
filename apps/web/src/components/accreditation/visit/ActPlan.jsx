// ─────────────────────────────────────────────────────────────────────────────
// ACT 6 — "So here's the plan."
//
// The draft is DETERMINISTIC AND SERVER-SIDE. Every item is a Phase G
// recommendation whose template already carries the school's actual numbers, its
// suggested owner role, its suggested metric and its estimated lift in real index
// points. The composer SELECTS and ORDERS; it writes no recommendation text and
// invents no number. THIS FILE DOES LESS THAN THAT: it renders `title`,
// `rationale`, `estimatedLift.points` and the frozen `estimatedLiftReason`
// verbatim, exactly as `/improvement`'s rail does, and adds no sentence about any
// item. There is no LLM anywhere on this path.
//
// AN EMPTY DRAFT SAYS WHY. `basis` carries `accreditationLicensed` and
// `frameworkAdopted` from Phase G's contract, so "no framework adopted yet" and
// "nothing left to work" are told apart. Rendering the second when it means the
// first congratulates a school that has not started.
//
// THE CAP IS THE SERVER'S (five), and `moreAvailable` states the remainder with a
// link to `/improvement` for the rest. This act does not duplicate the rail: half
// of the improvement manager rebuilt here would be two half-truths instead of one
// whole one.
//
// A VIEWER SEES THE DRAFT AND NO ADOPT CONTROL. A board member is exactly the
// audience for "what would a visiting team find", and the reasoning is the point;
// a dead button is not. The write itself is owner/accountant, server-enforced.
//
// PREMIUM UI P4 (a2): the draft is ruled rows on the ground (template + tags as
// tags, the lift as a count Pill, the no-number reason as a ruled note) and the
// one action is a flat primary Button.
// ─────────────────────────────────────────────────────────────────────────────
import { ArrowRight, Lightbulb, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { OWNER_ROLE_LABELS, TEMPLATE_LABELS } from '../../improvement/improvementMeta.js'
import { Button, Pill } from '../../ui/surface/index.js'
import '../../../styles/pending/a2-carry.css'

/** Stable identity for a draft item. `originRef` is never null (Phase G). */
export function planItemId(item) {
  return `${item?.templateId ?? 'rec'}:${item?.originRef ?? item?.findingKey ?? ''}`
}

function LiftChip({ lift }) {
  if (!lift || lift.points == null) return null
  return (
    <Pill variant="count" className="shrink-0">
      +{lift.points} index pts
    </Pill>
  )
}

function PlanItem({ item, selected, onToggle, canEdit }) {
  const hasLift = !!item?.estimatedLift && item.estimatedLift.points != null
  const id = planItemId(item)
  return (
    <li data-testid="plan-item">
      <div className="flex items-start gap-2.5">
        {canEdit ? (
          <input
            type="checkbox"
            id={`plan-${id}`}
            checked={selected}
            onChange={() => onToggle?.(id)}
            className="mt-1 h-4 w-4 shrink-0 accent-[#2563eb]"
            aria-label={item?.title}
          />
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-micro font-semibold uppercase text-ink2">
              {TEMPLATE_LABELS[item?.templateId] ?? 'Recommended'}
            </span>
            {(item?.standardTags ?? []).slice(0, 3).map((t) => (
              <span key={t} className="a2-code">
                {t}
              </span>
            ))}
            <span className="flex-1" />
            {hasLift ? <LiftChip lift={item.estimatedLift} /> : null}
          </div>
          <p className="mt-1 text-[15px] font-semibold leading-snug text-ink">{item?.title}</p>
          <p className="mt-0.5 text-small leading-relaxed text-ink2">{item?.rationale}</p>
          {/* No number is available — say why, in the engine's own frozen words. */}
          {!hasLift && item?.estimatedLiftReason ? (
            <p className="a2-note mt-2">{item.estimatedLiftReason}</p>
          ) : null}
          {item?.suggestedOwnerRole ? (
            <p className="mt-1.5 text-[12px] text-ink2">
              Suggested owner ·{' '}
              <span className="font-semibold text-ink">
                {OWNER_ROLE_LABELS[item.suggestedOwnerRole] ?? item.suggestedOwnerRole}
              </span>
            </p>
          ) : null}
        </div>
      </div>
    </li>
  )
}

/**
 * AN EMPTY DRAFT IS NOT ONE FACT, so it does not get one sentence — and this
 * component does not pick which one. The composer already told the three cases
 * apart from Phase G's `basis` and put the frozen sentence on `emptyReason`
 * ("no framework adopted yet" / "not licensed" / "everything is already being
 * worked"). Re-deriving that choice here from `basis` would be a SECOND code path
 * to the same fact, which is the drift this whole phase exists to end — and it is
 * how the screen ends up congratulating a school that has not started.
 *
 * `unavailableReason` is a fourth, separate case: the recommendations read
 * FAILED. "We could not look" and "we looked and there is nothing" are different
 * facts and this product never conflates them.
 */
function EmptyPlan({ plan }) {
  const sentence = plan?.unavailableReason || plan?.emptyReason || null
  const failed = !!plan?.unavailableReason
  if (!sentence) return null
  return (
    <div
      className={failed ? 'a2-note' : 'a2-empty'}
      data-tone={failed ? 'watch' : undefined}
      data-testid={failed ? 'plan-unavailable' : 'plan-empty'}
    >
      <p className="inline-flex items-start gap-1.5 text-small leading-relaxed text-ink">
        <Sparkles size={14} className="mt-[2px] shrink-0 text-ink2" aria-hidden />
        <span>{sentence}</span>
      </p>
    </div>
  )
}

export default function ActPlan({
  plan = null,
  canEdit = false,
  selectedIds = null,
  onToggle,
  onStart,
  /** The confirm card is open below: its "Create these initiatives" is the one
   *  primary on the act, so the trigger steps down to secondary. (VisitPage
   *  should pass its `confirming && canEdit`.) */
  confirming = false,
}) {
  const items = Array.isArray(plan?.items) ? plan.items : []
  const moreAvailable = typeof plan?.moreAvailable === 'number' ? plan.moreAvailable : 0

  if (items.length === 0) return <EmptyPlan plan={plan} />

  const selectedCount = selectedIds ? items.filter((i) => selectedIds.has(planItemId(i))).length : 0

  return (
    <div className="space-y-4">
      <ul className="a2-rows">
        {items.map((item) => (
          <PlanItem
            key={planItemId(item)}
            item={item}
            canEdit={canEdit}
            selected={selectedIds ? selectedIds.has(planItemId(item)) : false}
            onToggle={onToggle}
          />
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        {canEdit ? (
          <Button
            variant={confirming ? 'secondary' : 'primary'}
            onClick={onStart}
            disabled={selectedCount === 0}
            icon={<Lightbulb size={14} />}
          >
            Turn this into a plan
          </Button>
        ) : (
          <span className="text-small text-ink2">
            An owner or accountant can turn this draft into owned, dated work.
          </span>
        )}
        {moreAvailable > 0 ? (
          <Link
            to="/improvement"
            className="sec-more !mt-0"
          >
            {moreAvailable} more in the improvement manager
            <ArrowRight size={13} aria-hidden />
          </Link>
        ) : null}
      </div>
    </div>
  )
}
