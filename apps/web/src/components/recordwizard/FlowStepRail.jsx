// ─────────────────────────────────────────────────────────────────────────────
// FlowStepRail — the INNER micro rail for one record flow (Basics → Details →
// Review), living inside RecordFlow's hue-strip header. Deliberately an <ol>
// with aria-current="step" — NOT a second tablist: the outer WizardStepper
// already owns role="tablist" and two tablists on one screen is the a11y
// conflict this rail resolves. Visited steps are real <button>s (backward
// only); the current + future steps are inert. The connecting line fills
// 0→100% in the module hue as you advance; reduced motion → instant fill, no
// node scale.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import { hueRgba } from '../wizard/wizardConfigs.jsx'

export default function FlowStepRail({ labels, current, hue, reduce, disabled, onGoTo }) {
  return (
    <ol aria-label="Record steps" className="flex items-center gap-1.5">
      {labels.map((label, i) => {
        const state = i < current ? 'done' : i === current ? 'active' : 'todo'
        const reachable = i < current && !disabled // only go BACKWARD, never mid-save

        const node = (
          <>
            <motion.span
              initial={false}
              animate={reduce ? undefined : { scale: state === 'active' ? 1.08 : 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="flex h-6 w-6 items-center justify-center rounded-full text-[12px] font-bold text-white"
              style={{ backgroundColor: state === 'todo' ? hueRgba(hue, 0.25) : hue }}
            >
              {state === 'done' ? <Check size={13} strokeWidth={3} /> : i + 1}
            </motion.span>
            <span
              className={`text-[11px] font-bold uppercase tracking-[0.1em] ${
                state === 'todo' ? 'text-muted' : ''
              }`}
              style={state === 'todo' ? undefined : { color: hue }}
            >
              {label}
            </span>
          </>
        )

        return (
          <li
            key={label}
            aria-current={state === 'active' ? 'step' : undefined}
            className="flex flex-1 items-center gap-1.5 last:flex-none"
          >
            {reachable ? (
              <button
                type="button"
                onClick={() => onGoTo(i)}
                className="flex cursor-pointer items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2 outline-none transition-colors focus-visible:ring-2"
                style={{ '--tw-ring-color': hueRgba(hue, 0.5) }}
              >
                {node}
              </button>
            ) : (
              <span className="flex items-center gap-1.5 py-0.5 pl-0.5 pr-2">{node}</span>
            )}
            {i < labels.length - 1 && (
              <span
                aria-hidden="true"
                className="relative h-0.5 flex-1 overflow-hidden rounded-full"
                style={{ backgroundColor: hueRgba(hue, 0.2) }}
              >
                <motion.span
                  className="absolute inset-y-0 left-0 rounded-full"
                  style={{ backgroundColor: hue }}
                  initial={false}
                  animate={{ width: i < current ? '100%' : '0%' }}
                  transition={reduce ? { duration: 0 } : { duration: 0.45, ease: 'easeOut' }}
                />
              </span>
            )}
          </li>
        )
      })}
    </ol>
  )
}
