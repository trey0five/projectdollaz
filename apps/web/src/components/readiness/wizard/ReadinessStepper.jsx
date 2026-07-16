// ─────────────────────────────────────────────────────────────────────────────
// ReadinessStepper — the guided 5-step rail for the Review-Readiness wizard.
// Each step shows a numbered chip (→ check when complete), a label, and a tiny
// status line. Every step is clickable (all readiness data is editable at any
// time); the active step is highlighted, completed steps fill their connector.
// Exposed as an ARIA tablist. Reduced-motion safe (color only, no motion needed).
// ─────────────────────────────────────────────────────────────────────────────
import { Check } from 'lucide-react'

const HUE = '#2563eb'

export default function ReadinessStepper({ steps, current, onGoTo, panelId }) {
  const currentIdx = steps.findIndex((s) => s.key === current)

  return (
    <div
      role="tablist"
      aria-label="Readiness steps"
      className="card-soft flex gap-1 overflow-x-auto p-2.5 sm:gap-2 sm:p-3"
    >
      {steps.map((s, i) => {
        const active = i === currentIdx
        const done = s.done
        const Icon = s.Icon
        return (
          <div key={s.key} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
            <button
              type="button"
              role="tab"
              id={`readiness-tab-${s.key}`}
              aria-selected={active}
              aria-current={active ? 'step' : undefined}
              aria-controls={panelId}
              onClick={() => onGoTo(s.key)}
              className={`group flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2.5 py-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#2563eb]/50 ${
                active ? 'bg-[#2563eb]/[0.08]' : 'hover:bg-navy/[0.04]'
              }`}
            >
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-bold transition-colors ${
                  done
                    ? 'bg-emerald-500 text-white'
                    : active
                      ? 'text-white'
                      : 'bg-navy/[0.06] text-muted'
                }`}
                style={active && !done ? { backgroundColor: HUE } : undefined}
              >
                {done ? <Check size={15} /> : Icon ? <Icon size={15} /> : i + 1}
              </span>
              <span className="hidden min-w-0 flex-col sm:flex">
                <span
                  className={`truncate text-[12.5px] font-bold uppercase tracking-[0.04em] ${
                    active ? 'text-[#2563eb]' : done ? 'text-navy' : 'text-muted'
                  }`}
                >
                  {s.label}
                </span>
                <span
                  className={`truncate text-[11px] font-medium ${
                    done ? 'text-emerald-600' : active ? 'text-navy/60' : 'text-muted/70'
                  }`}
                >
                  {done ? 'Complete' : s.hint || `Step ${i + 1}`}
                </span>
              </span>
            </button>
            {i < steps.length - 1 && (
              <span
                aria-hidden="true"
                className="hidden h-0.5 w-4 shrink-0 rounded-full sm:block lg:w-6"
                style={{ backgroundColor: done ? '#10b981' : 'rgba(16,28,61,0.12)' }}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
