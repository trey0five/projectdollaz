// ─────────────────────────────────────────────────────────────────────────────
// ModuleTile — one HOME v2 tile, on the `Tile` primitive (Premium UI P2: 8px
// radius, hairline, a 2px bottom rule in the module hue, the hue flood rising
// once on hover while the arrow slides — no 18px shell, no tinted icon square,
// no watermark, no shine sweep). Two states:
//   • active  — the WHOLE tile navigates to the module page through a stretched
//     `.tile-hit` link (the Tile stays a div so the status control in its foot
//     can be a real button without nesting interactives). The status is a
//     `Pill status` ("7 need attention" with a risk mark) that opens the
//     briefing popup when there is something to see.
//   • locked  — the Add-ons upsell: the WHOLE tile is one button opening the
//     module-pitch popup (info + the add path), dimmed ink, a lock pill, no flood.
// Chip truth: `badge` = { count, critical } from the shared summariseBadges
// reducer over the SAME briefing payload the sidebar badges use. No period /
// no briefing → a neutral "—" pill (never crash, never invent a number).
// PENNY: `id={navId}` (tile-*) stays on the tile root — the same element the
// target registry has always measured.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Lock } from 'lucide-react'
import { Tile, Pill } from '../ui/surface/index.js'
import { tileLabel } from './tileRegistry.jsx'
import ModuleInfoPopup from './ModuleInfoPopup.jsx'

// Status from the badge summary. `ready` = we have a period + a briefing.
export function chipFor(badge, ready) {
  if (!ready) return { text: '—', tone: 'neutral' }
  const count = badge?.count ?? 0
  if (count > 0) {
    return {
      text: `${count} need${count === 1 ? 's' : ''} attention`,
      tone: badge.critical ? 'risk' : 'watch',
    }
  }
  return { text: 'All clear', tone: 'good' }
}

const ENTRANCE = (reduce, index) => ({
  initial: reduce ? { opacity: 0 } : { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: 0.05 + index * 0.04, duration: 0.36, ease: [0.22, 1, 0.36, 1] },
})

export default function ModuleTile({ tile, badge, ready, locked = false, index = 0, onShowAttention = null }) {
  const reduce = useReducedMotion()
  // Hoisted ABOVE the locked/active split so hook order is stable if a tile
  // flips state (e.g. right after an unlock) without a remount.
  const [infoOpen, setInfoOpen] = useState(false)
  const { key, hue, route, navId, tagline, Art } = tile
  const label = tileLabel(key)

  // ── Locked → the Add-ons-style upsell tile ─────────────────────────────────
  // ONE interaction: clicking anywhere on the tile opens the module-pitch popup
  // — the info AND the add path live there (its CTA routes to Membership).
  if (locked) {
    return (
      <motion.li {...ENTRANCE(reduce, index)} className="list-none">
        <Tile
          id={navId}
          hue={hue}
          locked
          onClick={() => setInfoOpen(true)}
          aria-label={`About the ${label} module`}
          aria-haspopup="dialog"
          icon={<Art />}
          title={label}
          body={tagline}
          arrow={false}
          className="h-full w-full"
          foot={
            <Pill>
              <Lock size={10} aria-hidden="true" /> Add to your plan
            </Pill>
          }
        />
        <ModuleInfoPopup open={infoOpen} tile={tile} onClose={() => setInfoOpen(false)} />
      </motion.li>
    )
  }

  // ── Unlocked but PAGE-LESS (hr/planning): the tile must NOT vanish after a
  // purchase. It stays on the map as a full tile deep-linking to the surface
  // where the module's value lives (e.g. HR → the Student-Teacher Ratio metric
  // drawer in Analytics). ────────────────────────────────────────────────────
  if (!route && tile.surface) {
    return (
      <motion.li {...ENTRANCE(reduce, index)} className="list-none">
        <Tile
          id={navId}
          hue={hue}
          to={tile.surface.to}
          aria-label={`${label} — included with your plan; ${tile.surface.label}`}
          icon={<Art />}
          title={label}
          body={tagline}
          className="h-full w-full"
          foot={<Pill>{tile.surface.label}</Pill>}
        />
      </motion.li>
    )
  }

  // ── Active tile ─────────────────────────────────────────────────────────────
  // The whole card navigates (stretched .tile-hit link). When there ARE
  // attention items the status pill becomes a real button ABOVE the hit link
  // that opens the briefing popup (the list of those items) — so the count is
  // finally actionable — while clicking anywhere else still opens the page.
  const chip = chipFor(badge, ready)
  const count = ready ? badge?.count ?? 0 : 0
  const hasAttention = count > 0 && typeof onShowAttention === 'function'
  return (
    <motion.li {...ENTRANCE(reduce, index)} className="list-none">
      <Tile
        id={navId}
        hue={hue}
        icon={<Art />}
        title={label}
        body={tagline}
        className="h-full w-full"
        foot={
          hasAttention ? (
            <Pill
              as="button"
              type="button"
              variant="status"
              tone={chip.tone}
              onClick={() => onShowAttention(tile.key)}
              aria-label={`View the ${count} item${count === 1 ? '' : 's'} that need attention in ${label}`}
              className="tile-lift cursor-pointer underline decoration-transparent underline-offset-2 transition-[text-decoration-color] hover:decoration-current focus:outline-none focus-visible:ring-2 focus-visible:ring-navy-soft/40"
            >
              {chip.text}
            </Pill>
          ) : (
            <Pill variant="status" tone={chip.tone} aria-hidden="true">
              {chip.text}
            </Pill>
          )
        }
      >
        <Link to={route} aria-label={`${label} — ${chip.text}`} className="tile-hit" />
      </Tile>
    </motion.li>
  )
}
