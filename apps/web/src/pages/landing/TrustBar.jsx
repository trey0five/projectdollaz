// TrustBar — the security/compliance strip near the foot of the public homepage.
// Restored (2026-10-17) to the pre-P5 look (74caaba): a soft gold hairline, a
// centred gold caps title over the approved statement, then four frosted
// glass chips with gradient-blue icon medallions that glow and breathe, a
// staggered whileInView entrance and a hover lift. The FERPA and AI chips link
// to the Privacy page, which explains the shared-responsibility model honestly.
// Copy lives in landingContent.js TRUST (APPROVED LANGUAGE ONLY —
// no-compliant-claim.spec.js guards it). The caps title is the section's h2 so
// the region keeps a real heading. Literal radii / arbitrary shadows: under
// ui.v2 rounded-xl+ clamp to 8px and shadow-glow collapses to a hairline.
// Reduced motion: no entrance, no lift, no breathing halo — the chips sit still.
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ShieldCheck, Lock, Server, Sparkles } from 'lucide-react'
import Reveal, { EASE } from './Reveal.jsx'
import { TRUST } from './landingContent.js'
import '../../styles/landing-restore-bottom.css'

const ICONS = {
  shield: ShieldCheck,
  lock: Lock,
  server: Server,
  sparkles: Sparkles,
}
const FOCUS_RING = 'outline-none focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:ring-offset-2'
const MEDALLION_GLOW = '0 0 0 1px rgba(37,99,235,0.45), 0 10px 34px rgba(37,99,235,0.28)'

function Badge({ icon, label, to, index }) {
  const reduce = useReducedMotion()
  const Icon = ICONS[icon] ?? ShieldCheck

  const card = (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 22 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.5, ease: EASE, delay: 0.12 + index * 0.12 }}
      whileHover={reduce ? undefined : { y: -5, scale: 1.035 }}
      className="lrb-trust-chip group relative flex h-full flex-col items-center gap-2 rounded-[16px] border border-gold/40 bg-white/75 px-2.5 py-4 text-center backdrop-blur-sm transition-[box-shadow,border-color] duration-300 hover:border-gold/50 sm:h-auto sm:flex-row sm:gap-3.5 sm:px-6 sm:text-left"
    >
      {/* gradient icon medallion */}
      <span
        className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-gold-gradient text-navy-deep sm:h-11 sm:w-11"
        style={{ boxShadow: MEDALLION_GLOW }}
      >
        <Icon size={19} strokeWidth={2.4} aria-hidden="true" />
        {/* soft pulsing halo */}
        {!reduce && (
          <motion.span
            aria-hidden="true"
            className="absolute inset-0 rounded-[12px] bg-gold/40 blur-md"
            animate={{ opacity: [0.25, 0.6, 0.25], scale: [1, 1.15, 1] }}
            transition={{
              duration: 3.2,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: index * 0.5,
            }}
          />
        )}
      </span>
      <span className="text-[11.5px] font-semibold leading-tight tracking-[0.01em] text-navy sm:whitespace-nowrap sm:text-[15.5px]">
        {label}
      </span>
    </motion.div>
  )

  return to ? (
    <Link to={to} className={`block h-full rounded-[16px] ${FOCUS_RING}`}>
      {card}
    </Link>
  ) : (
    card
  )
}

export default function TrustBar() {
  return (
    <section aria-labelledby="trust-h2" className="relative isolate overflow-hidden bg-transparent py-16">
      {/* gold top hairline */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/50 to-transparent"
      />

      <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal className="text-center">
          <h2 id="trust-h2" className="font-sans text-[12px] font-bold uppercase tracking-[0.22em] text-[#7a5e00]">
            {TRUST.heading}
          </h2>
          {/* The privacy statement in the approved words — the one place on the
              public site that says the posture out loud, above the badges. */}
          {TRUST.sub ? (
            <p data-testid="trust-statement" className="mx-auto mt-3 max-w-2xl text-[14.5px] leading-relaxed text-navy/75">
              {TRUST.sub}
            </p>
          ) : null}
        </Reveal>

        <ul className="mx-auto mt-7 grid max-w-md grid-cols-2 items-stretch gap-2.5 sm:mt-8 sm:flex sm:max-w-none sm:flex-wrap sm:items-center sm:justify-center sm:gap-5">
          {TRUST.items.map((item, i) => (
            <li key={item.label} className="sm:flex">
              <Badge {...item} index={i} />
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
