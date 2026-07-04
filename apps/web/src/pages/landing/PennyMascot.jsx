// ─────────────────────────────────────────────────────────────────────────────
// PennyMascot — the hero-only "walking" Penny. Reuses the real PennyAvatar coin
// for the face (so it matches the chat-header avatar exactly) and layers rubber-
// hose arms + legs BEHIND it, so the limb roots tuck under the coin. The limbs
// swing in a walk cycle (arms opposite the legs). Purely decorative (aria-hidden);
// under reduced motion the limbs are static. This component is NOT used anywhere
// else — every other PennyAvatar instance is untouched.
//
// The limb SVG overflows the coin box: its viewBox coin-center (85,60,r46) is
// aligned to PennyAvatar's own coin-center (size/2), so 1 viewBox unit = size/100.
// ─────────────────────────────────────────────────────────────────────────────
import { motion, useReducedMotion } from 'framer-motion'
import PennyAvatar from '../../components/penny/PennyAvatar.jsx'

const LIMB = '#B8912A' // gold rubber-hose
const HAND = '#E8CC6A' // light-gold mitten
const SHOE = '#16243B' // navy foot

export default function PennyMascot({ size = 52, playing = true }) {
  const reduce = useReducedMotion()
  const walk = playing && !reduce

  // A swing loop about a pivot (given in viewBox units via transform-box).
  const swing = (from, to, origin, delay = 0) => ({
    style: { transformBox: 'view-box', transformOrigin: origin },
    animate: walk ? { rotate: [from, to, from] } : { rotate: (from + to) / 2 },
    transition: walk
      ? { duration: 0.62, repeat: Infinity, ease: 'easeInOut', delay }
      : { duration: 0.3 },
  })

  return (
    <div style={{ position: 'relative', width: size, height: size }} aria-hidden="true">
      <svg
        width={size * 1.7}
        height={size * 1.9}
        viewBox="0 0 170 190"
        style={{ position: 'absolute', left: size * -0.35, top: size * -0.1, overflow: 'visible' }}
      >
        {/* Legs (behind the coin; the hips tuck under it). */}
        <motion.g {...swing(14, -14, '74px 102px')}>
          <path d="M74 100 Q69 126 67 148" fill="none" stroke={LIMB} strokeWidth="7" strokeLinecap="round" />
          <ellipse cx="63" cy="150" rx="9" ry="5" fill={SHOE} />
        </motion.g>
        <motion.g {...swing(-14, 14, '96px 102px', 0.31)}>
          <path d="M96 100 Q101 126 103 148" fill="none" stroke={LIMB} strokeWidth="7" strokeLinecap="round" />
          <ellipse cx="107" cy="150" rx="9" ry="5" fill={SHOE} />
        </motion.g>

        {/* Arms (opposite phase to the legs). */}
        <motion.g {...swing(-18, 12, '48px 66px', 0.31)}>
          <path d="M48 66 Q30 80 18 94" fill="none" stroke={LIMB} strokeWidth="7" strokeLinecap="round" />
          <circle cx="16" cy="95" r="6" fill={HAND} stroke="#9A7A18" strokeWidth="1.5" />
        </motion.g>
        <motion.g {...swing(18, -12, '122px 66px')}>
          <path d="M122 66 Q140 80 152 94" fill="none" stroke={LIMB} strokeWidth="7" strokeLinecap="round" />
          <circle cx="154" cy="95" r="6" fill={HAND} stroke="#9A7A18" strokeWidth="1.5" />
        </motion.g>
      </svg>

      {/* The real coin/face on top — identical to the chat-header avatar. */}
      <PennyAvatar size={size} />
    </div>
  )
}
