// ─────────────────────────────────────────────────────────────────────────────
// WizardChoose — step 1. The module's add-data options as `Tile`s (the ONE card
// family that stays — Premium UI §2.4): hairline, a 2px module-hue bottom rule,
// the hue flood rising once on hover while the arrow slides. A Tile with an
// onClick stays a <div> and is covered by a stretched `.tile-hit` <button>
// (full keyboard + focus ring); the `adddata-card-<key>` id stays on the tile —
// it is the anchor KYRO's walkthrough glides to (penny/guide/targetRegistry.js).
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import Tile from '../ui/surface/Tile.jsx'

export default function WizardChoose({ options, hue, onChoose }) {
  const reduce = useReducedMotion()
  const single = options.length === 1

  return (
    <ul
      role="list"
      className={`grid list-none gap-4 ${single ? 'max-w-md' : 'sm:grid-cols-2 lg:grid-cols-3'}`}
    >
      {options.map((opt, i) => {
        const Icon = opt.Icon
        return (
          <motion.li
            key={opt.key}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduce ? 0 : 0.04 * i + 0.04, duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            className="flex list-none"
          >
            <Tile
              // Stable anchor for KYRO's walkthrough glide: under ui.v2 the
              // Data-hub cards are gone, and these chooser tiles are their
              // successors — the target registry's v2 overrides point here.
              id={`adddata-card-${opt.key}`}
              onClick={() => onChoose(opt.key)}
              aria-label={`${opt.label} — ${opt.cta}`}
              hue={hue}
              icon={<Icon aria-hidden="true" strokeWidth={1.6} />}
              title={opt.label}
              body={opt.blurb}
              foot={<span className="text-[13px] font-semibold text-ink2">{opt.cta}</span>}
              className="w-full"
            />
          </motion.li>
        )
      })}
    </ul>
  )
}
