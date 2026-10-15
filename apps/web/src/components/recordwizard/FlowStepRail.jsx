// ─────────────────────────────────────────────────────────────────────────────
// FlowStepRail — the INNER progress indicator for one record flow, in the same
// grammar as the outer WizardStepper: small-caps step labels sitting on a
// hairline, and a 2px module-hue rule that grows (one-shot width transition) to
// the end of the active step. Visited steps stay real (backward-only)
// <button>s; current/future are inert. It's an <ol> with aria-current="step" —
// NOT a tablist (the outer WizardStepper owns role="tablist"; two on one screen
// is the a11y clash this avoids). Reduced motion → no transition (CSS).
// ─────────────────────────────────────────────────────────────────────────────
import { Check } from 'lucide-react'
import '../../styles/pending/c1-flows.css'

export default function FlowStepRail({ labels, current, disabled, onGoTo }) {
  const n = Math.max(labels.length, 1)
  const fill = `${((Math.min(current, n - 1) + 1) / n) * 100}%`

  return (
    <div className="steprule" style={{ '--steps': n }}>
      <ol aria-label="Record steps" className="steprule-list">
        {labels.map((label, i) => {
          const state = i < current ? 'done' : i === current ? 'active' : 'todo'
          const reachable = i < current && !disabled // backward only, never mid-save
          const content = (
            <>
              <span className="steprule-num">
                {state === 'done' ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : String(i + 1).padStart(2, '0')}
              </span>
              <span className="min-w-0 break-words">{label}</span>
            </>
          )
          return (
            <li key={label} aria-current={state === 'active' ? 'step' : undefined} className="min-w-0">
              {reachable ? (
                <button type="button" onClick={() => onGoTo(i)} className="steprule-btn" data-state={state}>
                  {content}
                </button>
              ) : (
                <span className="steprule-btn" data-state={state}>
                  {content}
                </span>
              )}
            </li>
          )
        })}
      </ol>
      <div className="steprule-track" aria-hidden="true">
        <span className="steprule-fill" style={{ width: fill }} />
      </div>
    </div>
  )
}
