// ─────────────────────────────────────────────────────────────────────────────
// WizardChoose — step 1. A grid of the module's add-data options as the shared
// Home-dashboard hue-flood tiles (home-tiles.css): on hover the whole card fills
// the module colour and its text flips white. Each card is a real <button> (full
// keyboard + focus ring from the shared .module-tile rules). The module accent is
// the per-module hue from the config (--tile-hue — the one non-token colour).
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import '../../styles/home-tiles.css'

export default function WizardChoose({ options, hue, onChoose }) {
  const reduce = useReducedMotion()
  const single = options.length === 1

  return (
    <ul role="list" className={`grid list-none gap-3 sm:gap-4 ${single ? '' : 'sm:grid-cols-2'}`}>
      {options.map((opt, i) => {
        const Icon = opt.Icon
        return (
          <motion.li
            key={opt.key}
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduce ? 0 : 0.05 * i + 0.04, duration: 0.3 }}
            whileHover={reduce ? undefined : { y: -4 }}
            className="list-none"
          >
            <button
              type="button"
              onClick={() => onChoose(opt.key)}
              className="module-tile group w-full text-left"
              style={{ '--tile-hue': hue }}
            >
              <span className="tile-body">
                <span className="tile-art">
                  <Icon aria-hidden="true" />
                </span>
                <div>
                  <h3 className="tile-title font-serif text-[17px] font-semibold leading-snug text-navy">
                    {opt.label}
                  </h3>
                  <p className="tile-sub mt-1 text-[13.5px] leading-relaxed text-muted">{opt.blurb}</p>
                </div>
                <div className="mt-auto flex items-center justify-between gap-3 pt-1">
                  <span className="tile-chip tile-chip--clear">{opt.cta}</span>
                  <span className="tile-arrow">
                    <ArrowRight size={16} />
                  </span>
                </div>
              </span>
            </button>
          </motion.li>
        )
      })}
    </ul>
  )
}
