// ─────────────────────────────────────────────────────────────────────────────
// ModuleTile — one HOME v2 tile. Two states:
//   • active  — a real <Link> to the module page: hue-tinted duotone art, label,
//     plain-language tagline, live status chip, arrow chip. Hover/focus-visible
//     runs the CSS color-flood + shine (home-tiles.css); framer-motion only does
//     the entrance stagger + lift (FeatureGateway's idiom), all reduced-motion
//     gated. aria-label carries "Label — chip text"; everything inside is
//     decoration (aria-hidden) so SRs hear one clean sentence.
//   • locked  — the Add-ons upsell (mirrors the sidebar rows): a <button> to
//     /settings/billing, dimmed grayscale-ish art, lock over the arrow corner,
//     "+ Add" pill, no flood.
// Chip truth: `badge` = { count, critical } from the shared summariseBadges
// reducer over the SAME briefing payload the sidebar badges use. No period /
// no briefing → a neutral "—" chip (never crash, never invent a number).
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, Lock, Plus } from 'lucide-react'
import { tileLabel } from './tileRegistry.jsx'

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

export default function ModuleTile({ tile, badge, ready, locked = false, index = 0 }) {
  const reduce = useReducedMotion()
  const navigate = useNavigate()
  const { key, hue, route, navId, tagline, Art } = tile
  const label = tileLabel(key)

  // ── Locked → the Add-ons-style upsell tile ─────────────────────────────────
  if (locked) {
    return (
      <motion.li {...ENTRANCE(reduce, index)} className="list-none">
        <button
          type="button"
          id={navId}
          onClick={() => navigate('/settings/billing')}
          aria-label={`Add ${label} module`}
          className="module-tile module-tile--locked"
          style={{ '--tile-hue': hue }}
        >
          <div className="tile-body">
            <div className="flex items-start justify-between gap-3">
              <span className="tile-art" aria-hidden="true">
                <Art />
              </span>
              <span
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-navy/5 text-navy/40"
              >
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
              <span className="tile-add-pill" aria-hidden="true">
                <Plus size={12} /> Add
              </span>
            </div>
          </div>
        </button>
      </motion.li>
    )
  }

  // ── Active tile ─────────────────────────────────────────────────────────────
  const chip = chipFor(badge, ready)
  return (
    <motion.li
      {...ENTRANCE(reduce, index)}
      whileHover={reduce ? undefined : { y: -4 }}
      className="list-none"
    >
      <Link
        id={navId}
        to={route}
        aria-label={`${label} — ${chip.text}`}
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
            <span className={`tile-chip tile-chip--${chip.tone}`}>{chip.text}</span>
            <span className="tile-arrow">
              <ArrowRight size={16} />
            </span>
          </div>
        </div>
      </Link>
    </motion.li>
  )
}
