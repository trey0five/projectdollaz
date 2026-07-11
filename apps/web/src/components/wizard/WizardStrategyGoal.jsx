// ─────────────────────────────────────────────────────────────────────────────
// WizardStrategyGoal — the modal-mode launcher for strategy's "Add a goal
// yourself" option. It REUSES the existing GoalForm unchanged (no reimplemented
// form), supplying the pillars/members it needs and wiring onSave to the real
// createGoal (the same glue StrategyPage uses). A goal must hang off a pillar
// under a plan; when the school has neither yet, we don't invent hidden entities —
// we gently point them at Penny to draft the plan first (the recommended path).
// ─────────────────────────────────────────────────────────────────────────────
import { Sparkles, Flag } from 'lucide-react'
import { useStrategy } from '../../hooks/useStrategy.js'
import { GoalForm } from '../strategy/StrategyForms.jsx'
import { handoffDraftPlan } from './wizardConfigs.jsx'

export default function WizardStrategyGoal({ schoolId, reduce, onClose, markSaved }) {
  const strat = useStrategy(schoolId)
  const { plan, pillars, members, hasPlan, loading, notLicensed, createGoal } = strat

  if (loading) {
    return (
      <div className="rounded-2xl border-2 border-rule/50 bg-white/60 p-8 text-center">
        <p className="text-[15px] text-muted">Loading your plan…</p>
      </div>
    )
  }

  if (notLicensed) {
    return (
      <TeachPanel
        title="Strategic Planning isn’t on this plan yet"
        body="Add the Strategic Planning module to set measurable, self-tracking goals."
      />
    )
  }

  // A goal is created under a pillar under a plan. If there is no plan (or no
  // pillar to attach to), draft the plan with Penny first rather than fabricate one.
  const canAddGoal = hasPlan && !!plan && Array.isArray(pillars) && pillars.length > 0
  if (!canAddGoal) {
    return (
      <div className="rounded-2xl border border-rule/70 bg-section/60 p-7 text-center">
        <span className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-gold/15 text-gold">
          <Flag size={22} />
        </span>
        <h3 className="font-serif text-lg font-semibold text-navy">
          Let’s stand up your plan first
        </h3>
        <p className="mx-auto mt-1.5 max-w-md text-[15px] leading-relaxed text-muted">
          Goals hang off a pillar in your strategic plan. Penny can draft the whole plan — pillars and
          measurable goals — from your live numbers in a few seconds.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              handoffDraftPlan()
              onClose()
            }}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gold-gradient px-4 py-2.5 text-[14px] font-bold uppercase tracking-[0.06em] text-navy shadow-glow transition-transform hover:-translate-y-0.5"
          >
            <Sparkles size={15} /> Draft with Penny
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-rule px-4 py-2.5 text-[14px] font-semibold text-muted transition-colors hover:text-navy"
          >
            Not now
          </button>
        </div>
      </div>
    )
  }

  return (
    <GoalForm
      initial={null}
      pillars={pillars}
      members={members}
      reduce={reduce}
      onClose={onClose}
      onSave={async (body) => {
        const { pillarId, ...rest } = body
        await createGoal(pillarId, rest)
        markSaved()
      }}
    />
  )
}

function TeachPanel({ title, body }) {
  return (
    <div className="rounded-2xl border border-rule/70 bg-section/60 p-7 text-center">
      <h3 className="font-serif text-lg font-semibold text-navy">{title}</h3>
      <p className="mx-auto mt-1.5 max-w-md text-[15px] leading-relaxed text-muted">{body}</p>
    </div>
  )
}
