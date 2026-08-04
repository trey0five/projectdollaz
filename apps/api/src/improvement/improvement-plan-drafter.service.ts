import { Injectable } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service.js'
import { ImprovementService } from './improvement.service.js'

// ─────────────────────────────────────────────────────────────────────────────
// AIC PHASE J — MODE A. THE LANGUAGE MODEL IS NEVER CALLED.
//
// Not "is called and then guarded" — never called. There is no client here, no
// prompt, no fallback path, and `improvement-plan-drafter.spec.ts` (MA-3) READS
// THIS FILE to assert that `assistant.client` appears nowhere in it. A guard is a
// filter over what a model said; a model that was never asked has said nothing,
// and that is a stronger guarantee than any filter.
//
// This service mirrors `StrategyPlanDrafterService` deliberately, down to its
// dependency list: PrismaService plus ONE domain service, no AnalyticsService, no
// InsightService, no BriefingService. The "Cannot access 'X' before initialization"
// crash-loop class has taken this container down twice, and a drafter is exactly
// the sort of late addition that reaches for a heavy service because it is
// convenient.
//
// EVERY STRING IN THE DRAFT IS ONE OF THREE THINGS, and MA-1 proves it by
// re-deriving each step's fields from the Recommendation it came from:
//   1. a `Recommendation` field, VERBATIM (title, rationale, originType, originRef);
//   2. a FROZEN template in this file with a computed integer substituted;
//   3. nothing. There is no fourth category and no sentence is authored per-school.
//
// ── THE ROOT, AND WHY IT IS ONE ROW ──────────────────────────────────────────
// The requirement is one `createdId` at the plan root so a single undo cascades.
// Three shapes were possible and two are wrong:
//
//   ✗ N sibling initiatives. No single reversible id — which is exactly why the
//     compound file_document→facilities write is excluded from REVERSIBLE_KINDS.
//   ✗ A StrategicPlan root cascading on FK. Requires the `strategy` licence, which
//     an accreditation-only school need not hold (`ImprovementService` is gated
//     OR('accreditation','strategy') precisely so it does not), and would plant a
//     strategic plan in /strategy that nobody asked for.
//   ✓ ONE ImprovementInitiative row IS the plan. `originType:'draft'` (already a
//     member of IMPROVEMENT_ORIGIN_TYPES, defined in Phase G as "a recommendation a
//     school has started but not committed to"), `progressSource:'milestone'`, and
//     the drafted steps as `milestones` JSON ON THAT SAME ROW. The cascade is total
//     by construction: one row, one delete, no orphan is even representable.
//
// `findingKey` on the root is NULL. A plan spans several findings; claiming one
// would lie about identity and would risk the @@unique([schoolId, findingKey])
// collision. `dueDate` and `targetRubricScore` on the root are NULL for a blunter
// reason: nobody stated a date, and a date invented here is the first number the
// LLM would have originated if we had asked it.
// ─────────────────────────────────────────────────────────────────────────────

/** Statuses that mean a draft is still live. A cancelled/done draft does not block a new one. */
const OPEN_DRAFT_STATUSES = ['planned', 'in_progress'] as const

/** Hard ceiling on one drafted plan. Five steps is a term of work, not a wish list. */
export const MAX_DRAFT_STEPS = 5

/** One drafted step. Every string field traces to a `Recommendation` field. */
export interface DraftPlanStep {
  /** `Recommendation.title`, VERBATIM. */
  label: string
  findingKey: string | null
  originType: string
  originRef: string
  /** `Recommendation.rationale`, VERBATIM. */
  rationale: string
  targetRubricScore: number | null
}

export interface DraftImprovementPlan {
  /** A frozen template with a computed integer. Never a per-school sentence. */
  title: string
  /** From the recommender's own `basis` — WHY the rail holds what it holds. */
  basis: { accreditationLicensed: boolean; frameworkAdopted: boolean }
  steps: DraftPlanStep[]
  counts: { steps: number }
  /** Non-null ⇒ a live draft already exists and THIS is it; propose nothing new. */
  alreadyDraftedInitiativeId: string | null
  demoData: boolean
}

export interface DraftPlanOptions {
  /** 1..5. Clamped, never trusted. */
  limit?: number
  /** Narrows the recommender's output by standardTags/originType ONLY. Never prose. */
  focus?: string
}

/** The frozen title template. The ONLY variable is a computed integer. */
function planTitle(stepCount: number): string {
  return stepCount === 1
    ? 'Improvement plan: 1 recommended step'
    : `Improvement plan: ${stepCount} recommended steps`
}

/**
 * WHY THERE IS NOTHING TO DRAFT — the three cases, kept apart.
 *
 * "There is nothing to plan" and "the register this reads was never licensed" are
 * different facts and only one of them is about the school. This lives HERE, beside
 * the `basis` it reads, and the assistant throws it: a zero-step plan never becomes
 * a proposal, so the differentiated reason has to reach the user as the refusal
 * message, not as a branch on a card that a zero-step proposal would have to exist
 * to render.
 */
export function emptyDraftReason(basis: DraftImprovementPlan['basis']): string {
  if (!basis?.accreditationLicensed) {
    return (
      'The accreditation module is not licensed for this school, so there are no recommendations ' +
      'to draft a plan from. That is not a finding that your school is clear — it is a register I ' +
      'did not read.'
    )
  }
  if (!basis.frameworkAdopted) {
    return (
      'This school has not adopted an accreditation framework yet, so there are no recommendations ' +
      'to draft a plan from. Recommendations are computed against an adopted framework’s standards.'
    )
  }
  return (
    'There are no open recommendations left to draft a plan from — every gap, assurance and ' +
    'warning is already being worked.'
  )
}

function clampLimit(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return MAX_DRAFT_STEPS
  return Math.max(1, Math.min(MAX_DRAFT_STEPS, Math.trunc(v)))
}

@Injectable()
export class ImprovementPlanDrafterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly improvement: ImprovementService,
  ) {}

  /**
   * Draft a plan from the Phase-G recommendation rail. READ-ONLY: nothing is
   * written here, ever. The caller turns the returned tree into ONE confirmable
   * proposal and the apply path creates the single root row.
   */
  async draft(schoolId: string, opts: DraftPlanOptions = {}): Promise<DraftImprovementPlan> {
    const limit = clampLimit(opts.limit)

    // DEDUPE FIRST, BEFORE ANY WORK. A school that already has a live draft gets
    // that draft back — drafting twice must not produce two plans, and the check
    // that prevents it has to run before the recommender, not after, or a second
    // confirm card can still be built from a fresh rail.
    const existing = await this.prisma.improvementInitiative.findFirst({
      where: { schoolId, originType: 'draft', status: { in: [...OPEN_DRAFT_STATUSES] } },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })

    const rail = await this.improvement.getRecommendations(schoolId, { limit: MAX_DRAFT_STEPS })

    const focus = typeof opts.focus === 'string' ? opts.focus.trim().toLowerCase() : ''
    // `focus` narrows by standardTags / originType and NOTHING ELSE. It never
    // becomes prose, never reaches a title, and never reaches the stored row: a
    // free-text steer that ended up in a record would be model-authored text in a
    // permanent place, which is the one thing this phase forbids outright.
    const matching = focus
      ? rail.recommendations.filter(
          (r) =>
            r.originType.toLowerCase() === focus ||
            r.standardTags.some((t) => t.toLowerCase() === focus),
        )
      : rail.recommendations
    // A focus that matches nothing falls back to the unfiltered rail rather than
    // returning an empty plan: "I found nothing about X" is a claim about the
    // school's register that a fuzzy word match is not entitled to make.
    const source = matching.length > 0 ? matching : rail.recommendations

    const steps: DraftPlanStep[] = source.slice(0, limit).map((r) => ({
      label: r.title,
      findingKey: r.findingKey,
      originType: r.originType,
      originRef: r.originRef,
      rationale: r.rationale,
      targetRubricScore: r.suggestedTargetRubricScore,
    }))

    return {
      title: planTitle(steps.length),
      basis: rail.basis,
      steps,
      counts: { steps: steps.length },
      alreadyDraftedInitiativeId: existing?.id ?? null,
      // The recommender reads no demo flag, and this service invents none. A
      // drafted plan is as demo as the school's own data, which the caller already
      // knows from the readiness payload it rendered beside this card.
      demoData: false,
    }
  }

  /**
   * The milestone rows the single root initiative carries. Ids are POSITIONAL
   * (`m1`, `m2`, …) exactly as `ImprovementService.normalizeMilestones` assigns
   * them, so the row this produces and the row the service writes agree.
   */
  static milestonesFor(steps: readonly DraftPlanStep[]): { id: string; label: string; done: boolean }[] {
    return steps.map((s, i) => ({ id: `m${i + 1}`, label: s.label, done: false }))
  }
}
