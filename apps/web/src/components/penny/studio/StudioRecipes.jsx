// StudioRecipes — the "Guided workflows" landing section. Curated multi-step
// routines KYRO runs end to end via its existing tools. Premium UI P4: the same
// `Tile` as the capability grid (KYRO gold rule + icon stroke) with the routine's
// steps as a numbered list. Clicking a tile calls onRun(recipe.prompt), which
// enters a conversation through the normal chat.send path.
import { motion, useReducedMotion } from 'framer-motion'
import { Section, Tile } from '../../ui/surface/index.js'
import { KYRO_HUE } from './studioTiles.js'
import { STUDIO_RECIPES } from './studioRecipes.js'

export default function StudioRecipes({ onRun }) {
  const reduce = useReducedMotion()
  return (
    <Section
      label="Guided workflows"
      aside={<span className="text-[13px] normal-case tracking-normal text-ink2">Multi-step routines KYRO runs for you, start to finish.</span>}
    >
      <ul role="list" className="grid list-none grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {STUDIO_RECIPES.map((r, i) => (
          // One-shot arrival stagger (the WizardChoose pattern), trailing the
          // capability grid above it.
          <motion.li
            key={r.id}
            initial={reduce ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              delay: reduce ? 0 : 0.04 * i + 0.16,
              duration: 0.32,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="flex list-none"
          >
            <Tile
              hue={KYRO_HUE}
              className="w-full"
              onClick={() => onRun(r.prompt)}
              aria-label={`${r.title} — run it`}
              icon={<r.Icon aria-hidden strokeWidth={1.6} />}
              title={r.title}
              body={r.description}
              foot={<span className="text-[13px] font-semibold text-ink2">Run it</span>}
            >
              {/* The routine, step by step — the order is the information. */}
              <ol className="mt-1 space-y-1 border-t border-hair pt-2.5">
                {r.steps.map((step, n) => (
                  <li key={n} className="flex items-baseline gap-2 text-[12.5px] leading-[18px] text-ink2">
                    <span className="w-4 shrink-0 text-[11px] font-semibold tabular-nums text-ink">{String(n + 1).padStart(2, '0')}</span>
                    {step}
                  </li>
                ))}
              </ol>
            </Tile>
          </motion.li>
        ))}
      </ul>
    </Section>
  )
}
