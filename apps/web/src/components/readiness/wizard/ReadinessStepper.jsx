// ─────────────────────────────────────────────────────────────────────────────
// ReadinessStepper — the guided 5-step rail for the Review-Readiness wizard.
// Each step shows a numbered chip (→ check when complete), a label, and a tiny
// status line. Every step is clickable (all readiness data is editable at any
// time); the active step is highlighted, completed steps fill their connector.
// Exposed as an ARIA tablist. Reduced-motion safe (color only, no motion needed).
// ─────────────────────────────────────────────────────────────────────────────
import { Check } from 'lucide-react'
import '../../../styles/pending/b2-finance.css'

// Premium UI P4 (plan sketch 5): the stepper is a row of 2px progress rules on
// the hairline — filled for done + current — with the step label and hint
// under each; no card. Each step stays a real tab (ids `readiness-tab-<key>`
// are the Penny/e2e anchors) wired to the panel.
export default function ReadinessStepper({ steps, current, onGoTo, panelId }) {
  const currentIdx = steps.findIndex((s) => s.key === current)

  return (
    <div role="tablist" aria-label="Readiness steps" className="b2-steps bg-ground py-3">
      {steps.map((s, i) => {
        const active = i === currentIdx
        const done = s.done
        return (
          <button
            key={s.key}
            type="button"
            role="tab"
            id={`readiness-tab-${s.key}`}
            aria-selected={active}
            aria-current={active ? 'step' : undefined}
            aria-controls={panelId}
            onClick={() => onGoTo(s.key)}
            className="b2-step group"
          >
            <span className="b2-step-rule">
              <i
                style={{
                  transform: `scaleX(${done || active ? 1 : 0})`,
                  transition: 'transform .3s ease',
                  background: done ? 'rgb(var(--c-good))' : undefined,
                }}
              />
            </span>
            <span className="b2-step-label flex items-center gap-1.5 group-hover:text-ink">
              {done ? <Check size={12} aria-label="complete" className="shrink-0" /> : <span className="tabular-nums">{i + 1}</span>}
              <span className="truncate">{s.label}</span>
            </span>
            <span className="hidden truncate text-[11px] text-ink2 sm:block">
              {done ? 'Complete' : s.hint || `Step ${i + 1}`}
            </span>
          </button>
        )
      })}
    </div>
  )
}
