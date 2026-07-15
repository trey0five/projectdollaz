// DomainPlates — Act V, the dark 3:00 PM band: everything else a school runs
// on, as six glass plates on a navy command-deck ground. The ledger spine and
// its medallion pass straight through the dark band.
import { useRef } from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import {
  BadgeCheck,
  HeartHandshake,
  Landmark,
  Library,
  ListChecks,
  Wrench,
} from 'lucide-react'
import Reveal, { EASE } from './Reveal.jsx'
import { TimestampMedallion } from './LedgerSpine.jsx'
import { DOMAIN_ACT, DOMAINS } from './landingContent.js'

const ICONS = { Landmark, BadgeCheck, Wrench, HeartHandshake, ListChecks, Library }

export default function DomainPlates() {
  const reduce = useReducedMotion()
  // Scroll-spy: blue-highlight this timeframe while the dark band is centered.
  const sectionRef = useRef(null)
  const active = useInView(sectionRef, { margin: '-45% 0px -45% 0px' })
  return (
    <section
      ref={sectionRef}
      aria-labelledby={`${DOMAIN_ACT.id}-h2`}
      className="relative scroll-mt-24 bg-studio-page py-24"
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-navy-radial" />
      {/* Blue flood — washes the dark band action-blue while it's the centered
          timeframe (z-0, under the plates + spine + medallion). */}
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 55%, #1E40AF 100%)' }}
        initial={false}
        animate={{ opacity: active ? 1 : 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      />
      <TimestampMedallion time={DOMAIN_ACT.time} tone="dark" active={active} />
      {/* z-[2]: the plates span the center line — keep them above the z-[1] spine. */}
      <div className="relative z-[2] mx-auto max-w-6xl px-5 pl-14 pt-12 sm:px-8 sm:pl-16 lg:px-8 lg:pt-20">
        <Reveal>
          <p
            className={`text-[12px] font-bold uppercase tracking-[0.22em] transition-colors duration-300 ${
              active ? 'text-white' : 'text-gold-light'
            }`}
          >
            {DOMAIN_ACT.kicker}
          </p>
        </Reveal>
        <Reveal delay={0.07}>
          <h2
            id={`${DOMAIN_ACT.id}-h2`}
            className="mt-3 max-w-3xl font-serif text-[32px] font-semibold leading-tight text-white sm:text-[42px]"
          >
            {DOMAIN_ACT.h2}
          </h2>
        </Reveal>
        <ul className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DOMAINS.map((domain, i) => {
            const Icon = ICONS[domain.icon]
            return (
              <motion.li
                key={domain.title}
                initial={reduce ? false : { opacity: 0, y: 24 }}
                whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-80px' }}
                transition={{ duration: 0.55, ease: EASE, delay: i * 0.07 }}
                // backdrop-blur: the ledger spine passes behind these glass
                // plates — frosting them diffuses the line under the glass
                // while it stays crisp in the grid gaps.
                className="rounded-2xl border border-white/10 bg-white/[0.05] p-5 backdrop-blur-md transition-colors duration-300 hover:border-gold/40 hover:bg-white/[0.08]"
              >
                <Icon size={20} aria-hidden="true" className="text-gold-light" />
                <p className="mt-3 font-serif text-[18px] font-semibold text-white">
                  {domain.title}
                </p>
                <p className="mt-1.5 text-[15px] leading-relaxed text-white/70">{domain.body}</p>
              </motion.li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
