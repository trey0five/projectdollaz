// DraftImprovementPlanCard — the BODY of a `draft_improvement_plan` proposal
// (AIC Phase J §5.1, MODE A). Cloned in shape from DraftPlanProposalCard: pure
// presentation of the payload, with confirm/cancel/applying/applied owned by the
// parent ProposalCard.
//
// MODE A IS THE POINT OF THIS FILE. `draft_improvement_plan` never calls a
// language model at all — the drafter injects PrismaService and ImprovementService
// and nothing else, and every string it emits is a `Recommendation` field verbatim
// or a frozen template with a computed integer in it. So this card SAYS SO, in the
// same place the Mode-B/C AdvisoryCard says the opposite. A reader who cannot tell
// a deterministic plan from phrased prose has been given a worse product than one
// who is told which is which, and the two provenance lines are the tell.
//
// Value safety: `label` and `rationale` are the recommender's own strings and are
// rendered verbatim. A null `targetRubricScore` renders NOTHING — never a "0",
// which would be a rubric claim nobody made.
import { motion, useReducedMotion } from 'framer-motion'
import { ClipboardList, Cpu, Info, Target } from 'lucide-react'

/**
 * The Mode-A declaration. Deliberately the mirror image of AdvisoryCard's
 * PROVENANCE_LINE — same slot, same weight, opposite claim.
 */
export const MODE_A_PROVENANCE =
  'Computed by KYRO from your improvement recommendations. No language model was called and no sentence here was written by one.'

/** originType → how the step's provenance reads. Unknown types fall through to the raw token. */
export const ORIGIN_LABELS = {
  gap: 'From a scored gap',
  finding: 'From an open finding',
  assurance: 'From an unmet assurance',
  evidence: 'From an evidence gap',
  manual: 'Hand-entered',
  draft: 'Drafted',
}

/**
 * WHY THERE IS NO FOUR-WAY "WHICH EMPTY IS IT" BRANCH HERE.
 *
 * It was here, and it was unreachable. `buildDraftImprovementPlanProposal` THROWS
 * when the drafter returns zero steps, so a zero-step plan never becomes a
 * ProposedAction and never reaches ProposalCard, which is the only thing that
 * renders this card. The differentiated reasons were a guard that could not fail —
 * the exact class this program has already shipped three times — and the spec that
 * covered them passed by constructing a payload the server cannot emit.
 *
 * The three reasons now live on the SERVER, in `emptyDraftReason`
 * (improvement-plan-drafter.service.ts), and reach the user as the refusal message
 * on a turn that produces no card at all. improvement-plan-drafter.spec.ts (MA-3)
 * asserts they stay distinct.
 *
 * What remains below is one defensive line for a payload that arrives with no steps
 * anyway — it states that fact and claims NOTHING about the school.
 */
export const NO_STEPS_LINE =
  'This proposal carries no steps. Nothing is being claimed about your school either way.'

function StepRow({ step, index, reduce }) {
  const target = Number.isFinite(step?.targetRubricScore) ? step.targetRubricScore : null
  const originLabel = step?.originType ? ORIGIN_LABELS[step.originType] || step.originType : null
  return (
    <motion.li
      data-testid="draft-step"
      initial={reduce ? false : { opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduce ? { duration: 0 } : { duration: 0.2, delay: 0.03 * index, ease: 'easeOut' }}
      className="rounded-lg border border-navy/10 bg-white/70 px-2.5 py-2"
    >
      <div className="flex items-start gap-2">
        <span className="mt-px inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-penny/25 text-[10.5px] font-bold tabular-nums text-[#7a5e00]">
          {index + 1}
        </span>
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold leading-snug text-navy">{step?.label}</p>
          {step?.rationale ? (
            <p className="mt-0.5 text-[12px] leading-snug text-navy/60">{step.rationale}</p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {originLabel ? (
              <span className="inline-flex items-center rounded-md border border-navy/15 bg-section px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-navy/60">
                {originLabel}
              </span>
            ) : null}
            {/* A null target renders nothing at all — "0" would be a rubric claim. */}
            {target != null ? (
              <span
                data-testid="draft-step-target"
                className="inline-flex items-center gap-1 rounded-md border border-navy/15 bg-section px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-navy/60"
              >
                <Target size={10} aria-hidden /> Target rubric level {target}
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </motion.li>
  )
}

export default function DraftImprovementPlanCard({ payload }) {
  const reduce = useReducedMotion()
  const plan = payload || {}
  const steps = Array.isArray(plan.steps) ? plan.steps : []
  const stepCount = Number.isFinite(plan?.counts?.steps) ? plan.counts.steps : steps.length
  const alreadyDrafted =
    typeof plan.alreadyDraftedInitiativeId === 'string' && plan.alreadyDraftedInitiativeId.length > 0

  return (
    <div data-testid="draft-improvement-plan" data-mode="A">
      <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-penny">
        <ClipboardList size={13} aria-hidden /> Penny drafted an improvement plan
        {plan.demoData ? (
          <span
            data-testid="draft-demo"
            className="ml-1 rounded-md border border-penny/40 bg-penny/10 px-1.5 py-px text-[10.5px] font-bold uppercase tracking-[0.08em] text-[#7a5e00]"
          >
            Demo data
          </span>
        ) : null}
      </p>

      <h4 className="mt-1 font-serif text-[19px] font-semibold leading-tight text-navy">
        {plan.title}
      </h4>

      {/* THE MODE-A DECLARATION — the mirror of AdvisoryCard's provenance strip. */}
      <p
        data-testid="draft-provenance"
        className="mt-1.5 flex items-start gap-1.5 rounded-lg border border-emerald-300/70 bg-emerald-50/70 px-2 py-1.5 text-[11.5px] leading-snug text-emerald-800"
      >
        <Cpu size={12} aria-hidden className="mt-px shrink-0" />
        <span>{MODE_A_PROVENANCE}</span>
      </p>

      {alreadyDrafted ? (
        // Drafting twice returns the FIRST draft rather than minting a second, and
        // the card has to say that or the user will believe they just created one.
        <p
          data-testid="draft-already"
          className="mt-2 flex items-start gap-1.5 rounded-lg border border-navy/15 bg-white/80 px-2 py-1.5 text-[12px] leading-snug text-navy/80"
        >
          <Info size={12} aria-hidden className="mt-px shrink-0" />
          <span>
            You already have a draft plan open. This is <strong>that</strong> plan — confirming
            will not create a second one.
          </span>
        </p>
      ) : null}

      {steps.length > 0 ? (
        <ol className="mt-2.5 space-y-1.5">
          {steps.map((step, i) => (
            <StepRow
              key={`${step?.findingKey ?? step?.originRef ?? 'step'}:${i}`}
              step={step}
              index={i}
              reduce={reduce}
            />
          ))}
        </ol>
      ) : (
        <div
          data-testid="draft-empty"
          className="mt-2 rounded-lg border border-navy/15 bg-white/70 px-2.5 py-2 text-[13px] leading-snug text-navy/80"
        >
          <p className="font-semibold">{NO_STEPS_LINE}</p>
        </div>
      )}

      {steps.length > 0 ? (
        <p data-testid="draft-summary" className="mt-2.5 text-[12px] font-semibold text-navy/60">
          {stepCount} step{stepCount === 1 ? '' : 's'} · one plan, one undo
        </p>
      ) : null}
    </div>
  )
}
