// ─────────────────────────────────────────────────────────────────────────────
// PennyTile — the 8th HOME tile: the door to Penny Studio (/penny). NOT a module
// (no license gate, no briefing chip); it reuses the module-tile chrome with
// Penny's PROTECTED gold hue ("Gold = Penny only" under v2), so the one gold tile
// reads instantly as the AI among the hued module tiles. The art is the live
// PennyAvatar coin itself.
//
// CLASSIC LOOK (origin/main 74caaba): `hc-` classes, styled only under
// `.home-classic` (styles/home-classic.css). The `tile-penny` id is the KYRO
// target and stays on the tile root.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { ArrowRight, Sparkles } from 'lucide-react'
import PennyAvatar from '../penny/PennyAvatar.jsx'

const PENNY_GOLD = '#b89650'

export default function PennyTile({ index = 0 }) {
  const reduce = useReducedMotion()
  return (
    <motion.li
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, type: 'spring', stiffness: 240, damping: 24 }}
      whileHover={reduce ? undefined : { y: -4 }}
      className="list-none"
    >
      <Link
        id="tile-penny"
        to="/penny"
        aria-label="KYRO Studio — your AI chief of staff"
        className="hc-tile"
        style={{ '--tile-hue': PENNY_GOLD }}
      >
        <div className="hc-body" aria-hidden="true">
          <span className="hc-art">
            <PennyAvatar size={40} active />
          </span>
          <div>
            <h3 className="hc-title font-serif text-[17px] font-semibold leading-snug text-navy">
              KYRO Studio
            </h3>
            <p className="hc-sub mt-1 text-[13.5px] leading-relaxed text-muted">
              Ask anything — KYRO reads your files, drafts reports, and updates the platform.
            </p>
          </div>
          <div className="mt-auto flex items-center justify-between gap-3 pt-1">
            <span
              className="hc-chip"
              style={{
                background: 'rgb(184 150 80 / 0.14)',
                color: '#8a6d33',
              }}
            >
              <Sparkles size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
              Your AI chief of staff
            </span>
            <span className="hc-arrow">
              <ArrowRight size={16} />
            </span>
          </div>
        </div>
      </Link>
    </motion.li>
  )
}
