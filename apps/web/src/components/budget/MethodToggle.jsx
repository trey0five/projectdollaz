// Phase 4 — Projection-method segmented control for the FY-End Forecast.
//
// The ledger segmented control (`.seg`: ink fill on the selected option, a
// hairline frame) under a Section rule. Controlled by projectionMethod ('manual' | 'rollforward') via
// onMethodChange. Module-scope (no in-render component defs). Disabled when the
// user can't edit. The two modes:
//   • manual     — type the returning roster directly (today's behavior).
//   • rollforward — age this year's roster up one grade with retention.
import { ClipboardList, ArrowUpRight } from 'lucide-react'
import { Section } from '../ui/surface/index.js'

const OPTIONS = [
  {
    value: 'manual',
    label: 'Manual roster',
    hint: 'Type next year’s returning students by grade',
    Icon: ClipboardList,
  },
  {
    value: 'rollforward',
    label: 'Roll forward from this year',
    hint: 'Age this year’s roster up a grade with retention',
    Icon: ArrowUpRight,
  },
]

export default function MethodToggle({ projectionMethod, onMethodChange, disabled }) {
  const method = projectionMethod === 'rollforward' ? 'rollforward' : 'manual'

  return (
    <Section
      label="Projection method"
      aside={
        <span>
          {method === 'rollforward'
            ? 'Next year’s roster is computed from this year’s grades.'
            : 'You enter next year’s returning roster directly.'}
        </span>
      }
    >
      <div role="tablist" aria-label="Projection method" className="seg !h-auto">
        {OPTIONS.map((opt) => {
          const active = method === opt.value
          const Icon = opt.Icon
          return (
            <button
              key={opt.value}
              type="button"
              role="tab"
              aria-selected={active}
              disabled={disabled}
              title={opt.hint}
              onClick={() => !active && onMethodChange(opt.value)}
              className="seg-btn !h-auto flex-col !items-start gap-0.5 py-1.5 text-left disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="flex items-center gap-1.5 text-[13px]">
                <Icon size={13} aria-hidden="true" />
                {opt.label}
              </span>
              <span className={`text-[11px] font-medium ${active ? 'text-white/75' : 'text-ink2'}`}>{opt.hint}</span>
            </button>
          )
        })}
      </div>
    </Section>
  )
}
