// ─────────────────────────────────────────────────────────────────────────────
// Penny — the inline-SVG gold coin mascot. Self-contained, no external asset. Pure
// SVG: a gold-gradient minted coin (outer ring + darker rim + thin inner concentric
// ring), a soft navy "$" engraving behind the face, two navy oval eyes with white
// catch-lights, and a small confident smile. The eyes blink and glance toward the
// active card; the parent (Penny) drives those via props. Decorative — aria-hidden;
// meaning is carried by Penny's live bubble text.
//
// `active` (additive-only): when true, draws a subtle static gold halo ring around
// the coin (used while Penny AI chat is open). When active=false the SVG is
// byte-identical to the original datahub avatar.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'

// glance: -1 (left) | 0 | 1 (right) — pupils translate ~2px toward the target.
// blink: boolean — eyes squash to a slit. celebrate: show a green check badge.
// active: boolean — subtle gold halo when the chat is open.
// speaking (additive): gold concentric ring that pulses while Penny talks (TTS).
// listening (additive): same pulse on the mic surface — used by the input mic,
//   not the header. Both new rings are decorative + gate on motion-safe.
export default function PennyAvatar({
  size = 56,
  glance = 0,
  blink = false,
  celebrate = false,
  active = false,
  speaking = false,
  listening = false,
}) {
  const px = glance * 2
  const pulsing = speaking || listening
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      style={{ display: 'block' }}
    >
      <defs>
        <radialGradient id="penny-face" cx="38%" cy="32%" r="80%">
          <stop offset="0%" stopColor="#F2DD92" />
          <stop offset="55%" stopColor="#E8CC6A" />
          <stop offset="100%" stopColor="#C9A227" />
        </radialGradient>
      </defs>

      {/* Speaking / listening concentric gold ring — pulses out from the rim.
          Decorative; gated on motion-safe via the className (CSS kills it under
          reduced motion). Sits behind the coin body so the rim stays crisp. */}
      {pulsing && (
        <circle
          cx="50"
          cy="50"
          r="48"
          fill="none"
          stroke="#E8CC6A"
          strokeWidth="3"
          opacity="0.6"
          className="motion-safe:animate-[penny-pulse-glow_1.5s_ease-in-out_infinite] motion-reduce:hidden"
          style={{ transformOrigin: '50px 50px' }}
        />
      )}

      {/* Coin body */}
      <circle cx="50" cy="50" r="46" fill="url(#penny-face)" stroke="#9A7A18" strokeWidth="3" />
      {/* Active halo (chat open) — subtle, static, decorative. */}
      {active && (
        <circle cx="50" cy="50" r="49" fill="none" stroke="#E8CC6A" strokeWidth="2" opacity="0.5" />
      )}
      {/* Minted inner concentric ring */}
      <circle cx="50" cy="50" r="40" fill="none" stroke="#B68F1E" strokeWidth="1.5" opacity="0.7" />

      {/* Engraved navy "$" behind the face */}
      <text
        x="50"
        y="68"
        textAnchor="middle"
        fontSize="58"
        fontWeight="700"
        fill="#16243B"
        opacity="0.07"
        style={{ fontFamily: 'Georgia, serif' }}
      >
        $
      </text>

      {/* Eyes (blink = squash via scaleY about each eye's center) */}
      <g fill="#16243B">
        <motion.ellipse
          cx={38 + px}
          cy="44"
          rx="5"
          ry={blink ? 0.6 : 6.5}
          style={{ originX: '38px', originY: '44px' }}
        />
        <motion.ellipse
          cx={62 + px}
          cy="44"
          rx="5"
          ry={blink ? 0.6 : 6.5}
          style={{ originX: '62px', originY: '44px' }}
        />
      </g>
      {/* Catch-lights */}
      {!blink && (
        <g fill="#FFFFFF" opacity="0.9">
          <circle cx={36.5 + px} cy="41.5" r="1.6" />
          <circle cx={60.5 + px} cy="41.5" r="1.6" />
        </g>
      )}

      {/* Confident upward smile */}
      <path
        d="M37 62 Q50 73 63 62"
        fill="none"
        stroke="#16243B"
        strokeWidth="3.2"
        strokeLinecap="round"
      />

      {/* Celebrate: small green check badge on the coin */}
      {celebrate && (
        <g>
          <circle cx="76" cy="74" r="13" fill="#10B981" stroke="#FFFFFF" strokeWidth="2.5" />
          <path
            d="M70 74 L75 79 L83 69"
            fill="none"
            stroke="#FFFFFF"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}
    </svg>
  )
}
