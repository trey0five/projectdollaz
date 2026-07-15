// ─────────────────────────────────────────────────────────────────────────────
// ModuleTile — one HOME v2 tile. Two states:
//   • active  — a real <Link> to the module page: hue-tinted duotone art, label,
//     plain-language tagline, live status chip, arrow chip. Hover/focus-visible
//     runs the CSS color-flood + shine (home-tiles.css); framer-motion only does
//     the entrance stagger + lift (FeatureGateway's idiom), all reduced-motion
//     gated. aria-label carries "Label — chip text"; everything inside is
//     decoration (aria-hidden) so SRs hear one clean sentence.
//   • locked  — the Add-ons upsell: the WHOLE tile is one button opening the
//     module-pitch popup (info + the add path), dimmed art, lock chip,
//     "+ Add" pill, no flood (and no hover white-out — locked tiles keep
//     their ink on the white card).
// Chip truth: `badge` = { count, critical } from the shared summariseBadges
// reducer over the SAME briefing payload the sidebar badges use. No period /
// no briefing → a neutral "—" chip (never crash, never invent a number).
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ArrowRight, Lock, Plus } from 'lucide-react'
import { tileLabel } from './tileRegistry.jsx'
import ModuleInfoPopup from './ModuleInfoPopup.jsx'

// Chip state from the badge summary. `ready` = we have a period + a briefing.
function chipFor(badge, ready) {
  if (!ready) return { text: '—', tone: 'none' }
  const count = badge?.count ?? 0
  if (count > 0) {
    return {
      text: `${count} need${count === 1 ? 's' : ''} attention`,
      tone: badge.critical ? 'critical' : 'attention',
    }
  }
  return { text: 'All clear', tone: 'clear' }
}

const ENTRANCE = (reduce, index) => ({
  initial: reduce ? { opacity: 0 } : { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { delay: index * 0.05, type: 'spring', stiffness: 240, damping: 24 },
})

export default function ModuleTile({
  tile,
  badge,
  ready,
  locked = false,
  index = 0,
  onShowAttention = null,
}) {
  const reduce = useReducedMotion()
  // Hoisted ABOVE the locked/active split so hook order is stable if a tile
  // flips state (e.g. right after an unlock) without a remount.
  const [infoOpen, setInfoOpen] = useState(false)
  const { key, hue, route, navId, tagline, Art } = tile
  const label = tileLabel(key)

  // ── Locked → the Add-ons-style upsell tile ─────────────────────────────────
  // ONE interaction: clicking anywhere on the tile (the + Add pill included)
  // opens the module-pitch popup — the info AND the add path live there (its
  // CTA routes to Membership). The outer div keeps the navId + geometry (Penny
  // tile-* anchors hold); a single stretched button covers the card, the visual
  // body sits under it pointer-events-none.
  if (locked) {
    return (
      <motion.li {...ENTRANCE(reduce, index)} className="list-none">
        <div
          id={navId}
          className="module-tile module-tile--locked"
          style={{ '--tile-hue': hue }}
        >
          <button
            type="button"
            className="tile-locked-hit"
            aria-label={`About the ${label} module`}
            aria-haspopup="dialog"
            onClick={() => setInfoOpen(true)}
          />
          <div className="tile-body" aria-hidden="true" style={{ pointerEvents: 'none' }}>
            <div className="flex items-start justify-between gap-3">
              <span className="tile-art">
                <Art />
              </span>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-navy/5 text-navy/40">
                <Lock size={14} />
              </span>
            </div>
            <div>
              <h3 className="tile-title font-serif text-[17px] font-semibold leading-snug">
                {label}
              </h3>
              <p className="tile-sub mt-1 text-[13.5px] leading-relaxed">{tagline}</p>
            </div>
            <div className="mt-auto flex items-center justify-between gap-3 pt-1">
              <span className="tile-add-pill">
                <Plus size={12} /> Add
              </span>
            </div>
          </div>
        </div>
        <ModuleInfoPopup open={infoOpen} tile={tile} onClose={() => setInfoOpen(false)} />
      </motion.li>
    )
  }

  // ── Unlocked but PAGE-LESS (hr/planning): the tile must NOT vanish after a
  // purchase. It stays on the map as a full-color tile deep-linking to the
  // surface where the module's value lives (e.g. HR → the Student-Teacher
  // Ratio metric drawer in Analytics). ────────────────────────────────────────
  if (!route && tile.surface) {
    return (
      <motion.li
        {...ENTRANCE(reduce, index)}
        whileHover={reduce ? undefined : { y: -4 }}
        className="list-none"
      >
        <Link
          id={navId}
          to={tile.surface.to}
          aria-label={`${label} — included with your plan; ${tile.surface.label}`}
          className="module-tile"
          style={{ '--tile-hue': hue }}
        >
          <div className="tile-body" aria-hidden="true">
            <span className="tile-art">
              <Art />
            </span>
            <div>
              <h3 className="tile-title font-serif text-[17px] font-semibold leading-snug text-navy">
                {label}
              </h3>
              <p className="tile-sub mt-1 text-[13.5px] leading-relaxed text-muted">{tagline}</p>
            </div>
            <div className="mt-auto flex items-center justify-between gap-3 pt-1">
              <span className="tile-chip tile-chip--clear">{tile.surface.label}</span>
              <span className="tile-arrow">
                <ArrowRight size={16} />
              </span>
            </div>
          </div>
        </Link>
      </motion.li>
    )
  }

  // ── Active tile ─────────────────────────────────────────────────────────────
  // The whole card navigates (stretched .tile-panel-hit link). When there ARE
  // attention items the status chip becomes a real button ABOVE the hit link that
  // opens the briefing popup (the list of those items) — so the count is finally
  // actionable — while clicking anywhere else still opens the module page.
  const chip = chipFor(badge, ready)
  const count = ready ? badge?.count ?? 0 : 0
  const hasAttention = count > 0 && typeof onShowAttention === 'function'
  return (
    <motion.li
      {...ENTRANCE(reduce, index)}
      whileHover={reduce ? undefined : { y: -4 }}
      className="list-none"
    >
      <div
        id={navId}
        className="module-tile module-tile--hit"
        style={{ '--tile-hue': hue }}
      >
        <Link to={route} aria-label={`${label} — ${chip.text}`} className="tile-panel-hit" />
        <div className="tile-body">
          <span className="tile-art" aria-hidden="true">
            <Art />
          </span>
          <div aria-hidden="true">
            <h3 className="tile-title font-serif text-[17px] font-semibold leading-snug text-navy">
              {label}
            </h3>
            <p className="tile-sub mt-1 text-[13.5px] leading-relaxed text-muted">{tagline}</p>
          </div>
          <div className="mt-auto flex items-center justify-between gap-3 pt-1">
            {hasAttention ? (
              <button
                type="button"
                onClick={() => onShowAttention(tile.key)}
                aria-label={`View the ${count} item${count === 1 ? '' : 's'} that need attention in ${label}`}
                className={`tile-chip tile-chip--${chip.tone} cursor-pointer underline decoration-transparent underline-offset-2 transition-[text-decoration-color] hover:decoration-current focus:outline-none focus-visible:ring-2 focus-visible:ring-navy/40`}
              >
                {chip.text}
              </button>
            ) : (
              <span className={`tile-chip tile-chip--${chip.tone}`} aria-hidden="true">
                {chip.text}
              </span>
            )}
            <span className="tile-arrow" aria-hidden="true">
              <ArrowRight size={16} />
            </span>
          </div>
        </div>
      </div>
    </motion.li>
  )
}
