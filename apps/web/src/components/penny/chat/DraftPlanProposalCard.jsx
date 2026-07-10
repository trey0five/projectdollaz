// DraftPlanProposalCard — the BODY of a `draft_strategy_plan` proposal (the
// centerpiece of "Penny drafts the plan"). It renders the frozen §SEAM
// draft-strategy tree Penny computed from the school's LIVE numbers, so the user
// can eyeball real band-derived targets before confirming. The confirm/cancel/
// applying/applied machinery lives in the PARENT ProposalCard — this component is
// pure presentation of the payload (no state, no buttons).
//
// TRUST is the point: every metric target is COMPUTED from the current value +
// its healthy band, never typed in. The trust banner says so; a starter plan
// (no financials yet) says the opposite honestly.
//
// Value-safety: we NEVER print raw targetValue (a fraction metric ships 0..1 in
// the payload). We render ONLY the drafter's precomputed formatted* strings —
// byte-identical to the dashboard's formatting.
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight, BadgeCheck, Flag, Sparkles, Target } from 'lucide-react'

// bandStatus → the shared strategy verdict language (PaceChip tokens): watch is
// amber-gold, risk is red. TEXT + colour (not colour alone) for accessibility.
const BAND = {
  watch: { label: 'Watch', chip: 'border-gold/40 bg-gold/10 text-[#7a5e00]' },
  risk: { label: 'At risk', chip: 'border-danger/30 bg-danger/10 text-danger' },
}

function BandChip({ status }) {
  const meta = BAND[status]
  if (!meta) return null
  return (
    <span
      className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold ${meta.chip}`}
    >
      {meta.label}
    </span>
  )
}

function GoalRow({ goal }) {
  const isMetric = goal?.goalType === 'metric'
  const milestoneCount = Array.isArray(goal?.milestones) ? goal.milestones.length : 0
  return (
    <li className="rounded-lg border border-navy/10 bg-white/70 px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {isMetric ? (
          <Target size={13} aria-hidden className="shrink-0 text-navy/50" />
        ) : (
          <Flag size={13} aria-hidden className="shrink-0 text-navy/50" />
        )}
        <span className="text-[13.5px] font-semibold text-navy">{goal?.title}</span>
        {isMetric ? (
          <>
            {goal?.metricLabel ? (
              <span className="inline-flex items-center rounded-md border border-navy/15 bg-section px-1.5 py-0.5 text-[11px] font-semibold text-navy/70">
                {goal.metricLabel}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1 text-[13px] font-semibold tabular-nums text-navy">
              {goal?.formattedCurrent}
              <ArrowRight size={12} aria-hidden className="text-gold" />
              {goal?.formattedTarget}
            </span>
            <BandChip status={goal?.bandStatus} />
          </>
        ) : (
          <span className="text-[12px] font-semibold text-muted">
            {milestoneCount} milestone{milestoneCount === 1 ? '' : 's'}
          </span>
        )}
      </div>
      {goal?.rationale ? (
        <p className="mt-1 text-[12px] leading-snug text-navy/60">{goal.rationale}</p>
      ) : null}
    </li>
  )
}

export default function DraftPlanProposalCard({ payload }) {
  const reduce = useReducedMotion()
  const plan = payload || {}
  const pillars = Array.isArray(plan.pillars) ? plan.pillars : []
  const counts = plan.counts || {}
  const pillarCount = counts.pillars ?? pillars.length
  const goalCount =
    counts.goals ?? pillars.reduce((n, p) => n + (Array.isArray(p?.goals) ? p.goals.length : 0), 0)
  const isStarter = !!plan.isStarter

  return (
    <div>
      <p className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-gold">
        <Sparkles size={13} aria-hidden /> Penny drafted a strategic plan
      </p>

      <h4 className="mt-1 font-serif text-[19px] font-semibold leading-tight text-navy">
        {plan.name}
        {plan.fyStartYear && plan.fyEndYear ? (
          <span className="ml-2 align-middle text-[13px] font-semibold uppercase tracking-[0.08em] text-navy/50">
            FY{plan.fyStartYear}–FY{plan.fyEndYear}
          </span>
        ) : null}
      </h4>

      {plan.mission ? (
        <p className="mt-1 text-[13.5px] italic leading-snug text-navy/70">{plan.mission}</p>
      ) : null}

      {/* Trust banner — the whole pitch of "Penny drafts the plan". */}
      <div
        className={
          'mt-2 flex items-start gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] leading-snug ' +
          (isStarter
            ? 'border-navy/15 bg-section text-navy/70'
            : 'border-emerald-300/70 bg-emerald-50/70 text-emerald-800')
        }
      >
        <BadgeCheck size={14} aria-hidden className="mt-px shrink-0" />
        <span>
          {isStarter ? (
            <>Starter template — connect your financials to compute live targets.</>
          ) : (
            <>
              Computed from your live numbers — not typed in.
              {plan.dataAsOf ? ` Data as of ${plan.dataAsOf}.` : ''}
            </>
          )}
        </span>
      </div>

      {/* Pillars → goals. */}
      <div className="mt-2.5 space-y-2.5">
        {pillars.map((pillar, pi) => {
          const goals = Array.isArray(pillar?.goals) ? pillar.goals : []
          return (
            <motion.div
              key={`${pillar?.name}:${pi}`}
              initial={reduce ? false : { opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduce ? { duration: 0 } : { duration: 0.22, delay: 0.04 * pi, ease: 'easeOut' }}
            >
              <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-navy/70">
                {pillar?.name}
              </p>
              <ul className="mt-1 space-y-1.5">
                {goals.map((goal, gi) => (
                  <GoalRow key={`${goal?.title}:${gi}`} goal={goal} />
                ))}
              </ul>
            </motion.div>
          )
        })}
      </div>

      {/* Summary strip. */}
      <p className="mt-2.5 text-[12px] font-semibold text-navy/60">
        {pillarCount} pillar{pillarCount === 1 ? '' : 's'} · {goalCount} goal
        {goalCount === 1 ? '' : 's'}
        {!isStarter && plan.fyEndYear ? ` · targets by Jun ${plan.fyEndYear}` : ''}
      </p>
    </div>
  )
}
