// StudioCapabilityTiles — the "Get something done" grid. Each tile either prefills
// the ask bar or sends straight into a conversation (handled by the parent via
// onSelect). Premium UI P4: `Tile`s (the one card family that stays) in KYRO's
// gold as the 2px rule + icon stroke — no gradient chips, no sheen sweep.
import { motion, useReducedMotion } from 'framer-motion'
import { Section, Tile } from '../../ui/surface/index.js'
import { STUDIO_TILES, KYRO_HUE } from './studioTiles.js'

export default function StudioCapabilityTiles({ onSelect, canEdit = false }) {
  const reduce = useReducedMotion()
  const tiles = STUDIO_TILES.filter((t) => !t.ownerOnly || canEdit)

  return (
    <Section
      label="Get something done"
      aside={
        <span className="text-[13px] normal-case tracking-normal text-ink2">One tap — KYRO does the work and shows you the result to approve.</span>
      }
    >
      <ul role="list" className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {tiles.map((t, i) => (
          // One-shot arrival stagger (the WizardChoose pattern).
          <motion.li
            key={t.id}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: reduce ? 0 : 0.04 * i + 0.04,
              duration: 0.32,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="flex list-none"
          >
            <Tile
              hue={KYRO_HUE}
              className="w-full"
              onClick={() => onSelect(t)}
              aria-label={`${t.title} — ${t.cta}`}
              icon={<t.Icon aria-hidden strokeWidth={1.6} />}
              title={t.title}
              body={t.blurb}
              foot={<span className="text-[13px] font-semibold text-ink2">{t.cta}</span>}
            />
          </motion.li>
        ))}
      </ul>
    </Section>
  )
}
