// ─────────────────────────────────────────────────────────────────────────────
// FlowStepRail — the INNER progress indicator for one record flow. Redesigned
// away from numbered nodes into a sleek labeled track: the step words sit above
// a slim rounded rail whose hue-gradient fill glides to the active step. Visited
// steps stay real (backward-only) <button>s; current/future are inert. It's an
// <ol> with aria-current="step" — NOT a tablist (the outer WizardStepper owns
// role="tablist"; two on one screen is the a11y clash this avoids). Reduced
// motion → instant fill, no glide.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { hueRgba } from '../wizard/wizardConfigs.jsx'

export default function FlowStepRail({ labels, current, hue, reduce, disabled, onGoTo }) {
  const last = Math.max(labels.length - 1, 1)
  const pct = (Math.min(current, last) / last) * 100

  return (
    <div>
      <ol aria-label="Record steps" className="mb-2 flex items-center justify-between gap-2">
        {labels.map((label, i) => {
          const state = i < current ? 'done' : i === current ? 'active' : 'todo'
          const reachable = i < current && !disabled // backward only, never mid-save
          const content = (
            <span
              className={`inline-flex items-center gap-1 whitespace-nowrap text-[11.5px] uppercase tracking-[0.13em] transition-colors ${
                state === 'active' ? 'font-extrabold' : state === 'done' ? 'font-bold' : 'font-semibold text-muted'
              }`}
              style={state === 'todo' ? undefined : { color: hue }}
            >
              {state === 'done' && <Check size={12} strokeWidth={3.5} />}
              {label}
            </span>
          )
          return (
            <li key={label} aria-current={state === 'active' ? 'step' : undefined} className="min-w-0">
              {reachable ? (
                <button
                  type="button"
                  onClick={() => onGoTo(i)}
                  className="rounded-md px-0.5 outline-none focus-visible:ring-2"
                  style={{ '--tw-ring-color': hueRgba(hue, 0.5) }}
                >
                  {content}
                </button>
              ) : (
                content
              )}
            </li>
          )
        })}
      </ol>
      <div
        className="relative h-[6px] w-full overflow-hidden rounded-full"
        style={{ backgroundColor: hueRgba(hue, 0.14) }}
      >
        <motion.span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ background: `linear-gradient(90deg, ${hueRgba(hue, 0.65)}, ${hue})` }}
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={reduce ? { duration: 0 } : { duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        />
        {/* A soft light head that rides the fill's leading edge (skipped for RM). */}
        {!reduce && pct > 0 && pct < 100 && (
          <motion.span
            aria-hidden
            className="absolute top-0 h-full w-6 rounded-full"
            style={{ background: `linear-gradient(90deg, transparent, ${hueRgba(hue, 0.55)})` }}
            initial={false}
            animate={{ left: `calc(${pct}% - 24px)` }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          />
        )}
      </div>
    </div>
  )
}
