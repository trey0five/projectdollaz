// ─────────────────────────────────────────────────────────────────────────────
// Penny — the inline-SVG gold coin mascot. Self-contained, no external asset.
// A properly minted golden coin: a metallic radial face (bright top-left → deep
// gold rim), a beveled rim, a reeded (milled) edge of fine ticks, an embossed
// inner ring, a soft engraved "$", a glossy sheen, and Penny's navy eyes (with
// catch-lights) + confident smile stamped on top. The eyes blink and glance
// toward the active card; the parent drives those via props. Decorative
// (aria-hidden) — meaning is carried by Penny's live bubble text.
//
// `active`: subtle static gold halo (chat open). `speaking`/`listening`: a gold
// concentric ring that pulses (motion-safe). `glance`/`blink`/`celebrate` as before.
// ─────────────────────────────────────────────────────────────────────────────
import { motion } from 'framer-motion'

// Reeded-edge ticks (the milled ridges around a coin's rim), precomputed once.
const REEDS = Array.from({ length: 76 }, (_, k) => {
  const a = (k / 76) * Math.PI * 2
  const c = Math.cos(a)
  const s = Math.sin(a)
  return [50 + c * 43.6, 50 + s * 43.6, 50 + c * 46.6, 50 + s * 46.6]
})

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
        {/* Metallic face: bright specular top-left falling to a deep-gold rim. */}
        <radialGradient id="penny-face" cx="36%" cy="30%" r="72%">
          <stop offset="0%" stopColor="#FFF7DA" />
          <stop offset="32%" stopColor="#F4DD8B" />
          <stop offset="64%" stopColor="#E2BE55" />
          <stop offset="88%" stopColor="#C6982A" />
          <stop offset="100%" stopColor="#9A781B" />
        </radialGradient>
        {/* Beveled rim: light at the top, dark at the bottom (edge catching light). */}
        <linearGradient id="penny-rim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FCEFC8" />
          <stop offset="48%" stopColor="#CBA531" />
          <stop offset="100%" stopColor="#7A5E16" />
        </linearGradient>
        {/* Soft top-left gloss sheen. */}
        <radialGradient id="penny-gloss" cx="36%" cy="26%" r="44%">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </radialGradient>
        <clipPath id="penny-clip">
          <circle cx="50" cy="50" r="47" />
        </clipPath>
      </defs>

      {/* Speaking / listening concentric gold ring — pulses out from the rim.
          Decorative; gated on motion-safe (CSS kills it under reduced motion). */}
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
      <circle cx="50" cy="50" r="47" fill="url(#penny-face)" />

      {/* Reeded (milled) edge — fine radial ticks clipped to the coin. */}
      <g clipPath="url(#penny-clip)" stroke="#7C5E16" strokeWidth="0.7" opacity="0.38">
        {REEDS.map((t, i) => (
          <line key={i} x1={t[0]} y1={t[1]} x2={t[2]} y2={t[3]} />
        ))}
      </g>

      {/* Beveled rim + inner light-catch line. */}
      <circle cx="50" cy="50" r="47" fill="none" stroke="url(#penny-rim)" strokeWidth="3" />
      <circle cx="50" cy="50" r="44.6" fill="none" stroke="#FDF0CC" strokeWidth="0.8" opacity="0.55" />
      {/* Active halo (chat open) — subtle, static, decorative. */}
      {active && (
        <circle cx="50" cy="50" r="49" fill="none" stroke="#E8CC6A" strokeWidth="2" opacity="0.5" />
      )}

      {/* Embossed minted inner ring (dark engrave + light highlight beneath). */}
      <circle cx="50" cy="50" r="37" fill="none" stroke="#96741C" strokeWidth="1.3" opacity="0.7" />
      <circle cx="50" cy="50" r="35.9" fill="none" stroke="#FBEEC4" strokeWidth="0.7" opacity="0.5" />

      {/* Engraved "$" behind the face. */}
      <text
        x="50"
        y="70"
        textAnchor="middle"
        fontSize="58"
        fontWeight="700"
        fill="#7A5E15"
        opacity="0.16"
        style={{ fontFamily: 'Georgia, serif' }}
      >
        $
      </text>

      {/* Glossy sheen over the upper-left metal (sits under the face features). */}
      <ellipse cx="39" cy="33" rx="29" ry="20" fill="url(#penny-gloss)" clipPath="url(#penny-clip)" />

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
