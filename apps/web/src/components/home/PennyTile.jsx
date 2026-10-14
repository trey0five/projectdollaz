// ─────────────────────────────────────────────────────────────────────────────
// PennyTile — the 8th HOME tile: the door to KYRO Studio (/penny). NOT a module
// (no license gate, no briefing chip); it is the same `Tile` as the module
// tiles with KYRO's PROTECTED gold as its hue ("Gold = KYRO only" under v2), so
// the one gold rule on the map reads instantly as the AI among the hued module
// tiles. The art is the live owl itself.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import { Sparkles } from 'lucide-react'
import { Tile, Pill } from '../ui/surface/index.js'
import PennyAvatar from '../penny/PennyAvatar.jsx'

const PENNY_GOLD = '#b89650'

export default function PennyTile({ index = 0 }) {
  const reduce = useReducedMotion()
  return (
    <motion.li
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 + index * 0.04, duration: 0.36, ease: [0.22, 1, 0.36, 1] }}
      className="list-none"
    >
      <Tile
        id="tile-penny"
        to="/penny"
        hue={PENNY_GOLD}
        aria-label="KYRO Studio — your AI chief of staff"
        icon={<PennyAvatar size={32} active />}
        title="KYRO Studio"
        body="Ask anything — KYRO reads your files, drafts reports, and updates the platform."
        className="h-full w-full"
        foot={
          <Pill variant="status" tone="hue">
            <Sparkles size={10} aria-hidden="true" />
            Your AI chief of staff
          </Pill>
        }
      />
    </motion.li>
  )
}
