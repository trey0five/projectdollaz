// ─────────────────────────────────────────────────────────────────────────────
// WizardStepper — the 3-step progress rail, exposed as an ARIA tablist so screen
// readers can perceive and (for already-visited steps) move between the steps. The
// active step carries aria-current="step"; each tab controls the single wizard
// panel (aria-controls -> panelId). Completed steps are focusable/clickable to go
// back; the pending step is disabled. Purely presentational beyond that.
// ─────────────────────────────────────────────────────────────────────────────
import { Check } from 'lucide-react'
import { hueRgba } from './wizardConfigs.jsx'

const STEPS = [
  { key: 'choose', label: 'Choose' },
  { key: 'work', label: 'Add' },
  { key: 'confirm', label: 'Done' },
]

export default function WizardStepper({ current, hue, panelId, onGoTo }) {
  const currentIdx = STEPS.findIndex((s) => s.key === current)

  return (
    <div role="tablist" aria-label="Add data steps" className="flex items-center gap-2">
      {STEPS.map((s, i) => {
        const state = i < currentIdx ? 'done' : i === currentIdx ? 'active' : 'todo'
        const reachable = i < currentIdx // only go BACKWARD to a completed step
        return (
          <div key={s.key} className="flex flex-1 items-center gap-2 last:flex-none">
            <button
              type="button"
              role="tab"
              id={`wiz-tab-${s.key}`}
              aria-selected={state === 'active'}
              aria-current={state === 'active' ? 'step' : undefined}
              aria-controls={panelId}
              disabled={!reachable}
              onClick={reachable ? () => onGoTo(s.key) : undefined}
              className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-[13px] font-bold outline-none transition-colors focus-visible:ring-2 ${
                reachable ? 'cursor-pointer' : 'cursor-default'
              }`}
              style={{ '--tw-ring-color': hueRgba(hue, 0.5) }}
            >
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold text-white"
                style={{
                  backgroundColor:
                    state === 'todo' ? hueRgba(hue, 0.25) : hue,
                }}
              >
                {state === 'done' ? <Check size={14} /> : i + 1}
              </span>
              <span
                className="uppercase tracking-[0.08em]"
                style={{ color: state === 'todo' ? undefined : hue }}
              >
                <span className={state === 'todo' ? 'text-muted' : ''}>{s.label}</span>
              </span>
            </button>
            {i < STEPS.length - 1 && (
              <span
                className="h-0.5 flex-1 rounded-full"
                style={{ backgroundColor: i < currentIdx ? hue : hueRgba(hue, 0.2) }}
                aria-hidden="true"
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
