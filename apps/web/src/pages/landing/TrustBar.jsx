// TrustBar — the security/compliance strip near the foot of the public homepage.
// Flashy + dynamic: a living navy-gradient backdrop (StudioBackdrop orbs/motes), a
// gold hairline, gradient icon medallions with a glow, a staggered whileInView
// entrance, and a hover lift. The FERPA medallion links to the Privacy page, which
// explains the shared-responsibility model honestly.
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ShieldCheck, Lock, Server } from 'lucide-react'
import Reveal, { EASE } from './Reveal.jsx'
import { TRUST } from './landingContent.js'

const ICONS = { shield: ShieldCheck, lock: Lock, server: Server }
const FOCUS_RING = 'outline-none focus-visible:ring-2 focus-visible:ring-gold/60'

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
      className="group relative flex h-full flex-col items-center gap-2 rounded-2xl border border-gold/40 bg-white/75 px-2.5 py-4 text-center shadow-[0_14px_36px_-18px_rgba(16,28,61,0.35)] backdrop-blur-sm transition-[box-shadow,border-color] duration-300 hover:border-gold/50 hover:shadow-glow sm:h-auto sm:flex-row sm:gap-3.5 sm:px-6 sm:text-left"
    >
      {/* gradient icon medallion */}
      <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gold-gradient text-navy-deep shadow-glow sm:h-11 sm:w-11">
        <Icon size={19} strokeWidth={2.4} />
        {/* soft pulsing halo */}
        {!reduce && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-xl bg-gold/40 blur-md"
            animate={{ opacity: [0.25, 0.6, 0.25], scale: [1, 1.15, 1] }}
            transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: index * 0.5 }}
          />
        )}
      </span>
      <span className="text-[11.5px] font-semibold leading-tight tracking-[0.01em] text-navy sm:whitespace-nowrap sm:text-[15.5px]">
        {label}
      </span>
    </motion.div>
  )

  return to ? (
    <Link to={to} aria-label={label} className={`rounded-2xl ${FOCUS_RING}`}>
      {card}
    </Link>
  ) : (
    card
  )
}

export default function TrustBar() {
  return (
    <section
      aria-label="Security & compliance"
      className="relative isolate overflow-hidden bg-transparent py-16"
    >
      {/* gold top hairline */}
      <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/50 to-transparent" />

      <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal className="text-center">
          <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#7a5e00]">
            {TRUST.heading}
          </p>
        </Reveal>

        <ul className="mx-auto mt-7 grid max-w-md grid-cols-3 items-stretch gap-2.5 sm:mt-8 sm:flex sm:max-w-none sm:flex-wrap sm:items-center sm:justify-center sm:gap-5">
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
