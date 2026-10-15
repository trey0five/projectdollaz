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
import Button from '../ui/surface/Button.jsx'
import '../../styles/pending/c1-flows.css'

export default function WizardStrategyGoal({ schoolId, reduce, onClose, markSaved }) {
  const strat = useStrategy(schoolId)
  const { plan, pillars, members, hasPlan, loading, notLicensed, createGoal } = strat

  if (loading) {
    return (
      <div className="px-5 py-8">
        <p className="text-[14px] text-ink2">Loading your plan…</p>
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
      <div className="flex items-start gap-3.5 px-5 py-6">
        <span className="tone-hue mt-1 shrink-0" aria-hidden="true">
          <Flag size={22} strokeWidth={1.6} />
        </span>
        <div className="min-w-0">
          <h3 className="font-serif text-title font-medium text-ink">Let’s stand up your plan first</h3>
          <p className="mt-1 max-w-[60ch] text-[14px] leading-[22px] text-ink2">
            Goals hang off a pillar in your strategic plan. KYRO can draft the whole plan — pillars and
            measurable goals — from your live numbers in a few seconds.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              className="btn-kyro"
              icon={<Sparkles size={15} />}
              onClick={() => {
                handoffDraftPlan()
                onClose()
              }}
            >
              Draft with KYRO
            </Button>
            <Button variant="quiet" onClick={onClose}>
              Not now
            </Button>
          </div>
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
    <div className="px-5 py-6">
      <h3 className="font-serif text-title font-medium text-ink">{title}</h3>
      <p className="mt-1 max-w-[60ch] text-[14px] leading-[22px] text-ink2">{body}</p>
    </div>
  )
}
