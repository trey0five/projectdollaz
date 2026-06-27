// Phase 4 — Projection-method segmented control for the FY-End Forecast.
//
// Navy/gold segmented toggle with a framer-motion sliding pill ("flashy but
// on-theme"). Controlled by projectionMethod ('manual' | 'rollforward') via
// onMethodChange. Module-scope (no in-render component defs). Disabled when the
// user can't edit. The two modes:
//   • manual     — type the returning roster directly (today's behavior).
//   • rollforward — age this year's roster up one grade with retention.
import { motion } from 'framer-motion'
import { ClipboardList, ArrowUpRight } from 'lucide-react'

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
    <div className="card-soft p-4">
      <div className="mb-2.5 flex items-center gap-2">
        <h4 className="font-serif text-[15px] font-semibold text-navy">Projection method</h4>
        <span className="text-[12px] text-muted">
          {method === 'rollforward'
            ? 'Next year’s roster is computed from this year’s grades.'
            : 'You enter next year’s returning roster directly.'}
        </span>
      </div>
      <div
        role="tablist"
        aria-label="Projection method"
        className="relative grid grid-cols-2 gap-1.5 rounded-xl border border-rule bg-cream/60 p-1.5"
      >
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
              onClick={() => !active && onMethodChange(opt.value)}
              className={`relative z-10 flex flex-col items-start gap-0.5 rounded-lg px-3.5 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                active ? 'text-white' : 'text-navy hover:text-gold'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="method-toggle-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                  className="absolute inset-0 -z-10 rounded-lg bg-navy-gradient shadow-glow"
                />
              )}
              <span className="flex items-center gap-1.5 text-[13.5px] font-semibold">
                <Icon size={15} className={active ? 'text-gold-light' : 'text-gold'} />
                {opt.label}
              </span>
              <span className={`text-[11.5px] ${active ? 'text-gold-light/90' : 'text-muted'}`}>
                {opt.hint}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
