// ─────────────────────────────────────────────────────────────────────────────
// WizardStepper — the progress rule, exposed as an ARIA tablist so screen
// readers can perceive and (for already-visited steps) move between the steps.
// The active step carries aria-current="step"; each tab controls the single
// wizard panel (aria-controls -> panelId). Completed steps are focusable /
// clickable to go back; the pending step is disabled.
//
// Premium UI P4 (plan sketch 5): not a card. Three small-caps labels sit ON the
// PageHeader's bottom hairline, and a 2px rule in the module hue grows along that
// hairline to the end of the active step (a one-shot width transition). The
// classes live in styles/pending/c1-flows.css (.steprule*).
// ─────────────────────────────────────────────────────────────────────────────
import { Check } from 'lucide-react'
import '../../styles/pending/c1-flows.css'

const STEPS = [
  { key: 'choose', label: 'Choose' },
  { key: 'work', label: 'Add' },
  { key: 'confirm', label: 'Done' },
]

// `skipChoose` drops the Choose step entirely for single-option modules: they
// auto-advance past it on entry, so showing (and offering to go back to) a
// one-card picker is dead chrome — Back goes to the module overview instead.
//
// `bare` keeps the rule (and the tablist, for screen readers) but hides the
// labels — used while a record flow is open, so its own labelled step rail is
// the only labelled stepper on screen.
//
// `skipDone` drops the Done step for an option that finishes itself (Finance's
// trial balance ends in one "Done — show my numbers" that opens the overview),
// so the rail never promises a third screen that will not come.
export default function WizardStepper({ current, panelId, onGoTo, skipChoose = false, skipDone = false, bare = false }) {
  const steps = STEPS.filter((s) => !(skipChoose && s.key === 'choose') && !(skipDone && s.key === 'confirm'))
  const currentIdx = Math.max(0, steps.findIndex((s) => s.key === current))
  const fill = `${((currentIdx + 1) / steps.length) * 100}%`

  return (
    <div className="steprule" style={{ '--steps': steps.length }}>
      <div
        role="tablist"
        aria-label="Add data steps"
        className={bare ? 'steprule-list sr-only' : 'steprule-list'}
      >
        {steps.map((s, i) => {
          const state = i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'todo'
          const reachable = i < currentIdx // only go BACKWARD to a completed step
          return (
            <button
              key={s.key}
              type="button"
              role="tab"
              id={`wiz-tab-${s.key}`}
              aria-selected={state === 'active'}
              aria-current={state === 'active' ? 'step' : undefined}
              aria-controls={panelId}
              disabled={!reachable}
              data-state={state}
              onClick={reachable ? () => onGoTo(s.key) : undefined}
              className="steprule-btn"
            >
              <span className="steprule-num">
                {state === 'done' ? <Check size={11} strokeWidth={3} aria-hidden="true" /> : String(i + 1).padStart(2, '0')}
              </span>
              <span>{s.label}</span>
            </button>
          )
        })}
      </div>
      <div className="steprule-track" aria-hidden="true">
        <span className="steprule-fill" style={{ width: fill }} />
      </div>
    </div>
  )
}
