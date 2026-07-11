// ─────────────────────────────────────────────────────────────────────────────
// WizardChoose — step 1. A hue-tinted card grid of the module's add-data options.
// Each card is a real <button> (full keyboard + focus ring). Cards stagger up on
// mount unless prefers-reduced-motion (then opacity-only). The module accent is
// the per-module hue from the config (inline style — the one non-token color).
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import { hueRgba } from './wizardConfigs.jsx'

export default function WizardChoose({ options, hue, onChoose }) {
  const reduce = useReducedMotion()
  const single = options.length === 1

  return (
    <div className={`grid gap-3 sm:gap-4 ${single ? '' : 'sm:grid-cols-2'}`}>
      {options.map((opt, i) => {
        const Icon = opt.Icon
        return (
          <motion.button
            key={opt.key}
            type="button"
            onClick={() => onChoose(opt.key)}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduce ? 0 : 0.05 * i + 0.04, duration: 0.3 }}
            whileHover={reduce ? undefined : { y: -3 }}
            className="group relative flex flex-col items-start gap-3 rounded-2xl border-2 bg-white p-5 text-left shadow-card outline-none transition-colors focus-visible:ring-2"
            style={{
              borderColor: hueRgba(hue, 0.28),
              // focus ring color follows the module hue
              '--tw-ring-color': hueRgba(hue, 0.5),
            }}
          >
            <span
              className="flex h-11 w-11 items-center justify-center rounded-xl"
              style={{ backgroundColor: hueRgba(hue, 0.12), color: hue }}
            >
              <Icon size={22} />
            </span>
            <div className="min-w-0">
              <h3 className="font-serif text-[17px] font-semibold text-navy">{opt.label}</h3>
              <p className="mt-1 text-[14px] leading-relaxed text-muted">{opt.blurb}</p>
            </div>
            <span
              className="mt-1 inline-flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-[0.06em] transition-transform group-hover:translate-x-0.5"
              style={{ color: hue }}
            >
              {opt.cta}
              <ArrowRight size={14} />
            </span>
          </motion.button>
        )
      })}
    </div>
  )
}
