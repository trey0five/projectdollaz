// TrustBar — the security / privacy statement near the foot of the public
// homepage. Premium UI P5: on the ground under the page's section rule — the
// approved statement as the lede, then the four commitments as a ruled row
// (vertical hairlines, ink icon strokes, no medallions, no glass, no pulsing
// halo). The FERPA and AI items link to the Privacy page, which explains the
// shared-responsibility model honestly. Copy lives in landingContent.js TRUST
// (APPROVED LANGUAGE ONLY — no-compliant-claim.spec.js guards it).
import { Link } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ShieldCheck, Lock, Server, Sparkles, ArrowRight } from 'lucide-react'
import { EASE } from './Reveal.jsx'
import SectionHead from './SectionHead.jsx'
import { TRUST } from './landingContent.js'
import '../../styles/pending/p5-landing.css'

const ICONS = { shield: ShieldCheck, lock: Lock, server: Server, sparkles: Sparkles }

function Item({ icon, label, to, index }) {
  const reduce = useReducedMotion()
  const Icon = ICONS[icon] ?? ShieldCheck
  const inner = (
    <>
      <Icon size={20} strokeWidth={1.75} className="mt-px shrink-0 text-ink" aria-hidden="true" />
      <span className="text-[15px] font-semibold leading-[22px] text-ink">{label}</span>
      {to ? (
        <ArrowRight
          size={14}
          aria-hidden="true"
          className="ml-auto mt-1 shrink-0 text-ink2 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-ink"
        />
      ) : null}
    </>
  )
  return (
    <motion.li
      initial={reduce ? false : { opacity: 0, y: 10 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-60px' }}
      transition={{ duration: 0.45, ease: EASE, delay: reduce ? 0 : index * 0.07 }}
    >
      {to ? (
        <Link
          to={to}
          className="group flex items-start gap-3 rounded-sm outline-none hover:underline hover:decoration-hair hover:underline-offset-4 focus-visible:ring-2 focus-visible:ring-[#2563EB]/50 focus-visible:ring-offset-2"
        >
          {inner}
        </Link>
      ) : (
        <div className="flex items-start gap-3">{inner}</div>
      )}
    </motion.li>
  )
}

export default function TrustBar() {
  return (
    <section aria-labelledby="trust-h2" className="py-20">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <SectionHead id="trust-h2" kicker="Security & privacy" title={TRUST.heading}>
          {/* The privacy statement in the approved words — the one place on the
              public site that says the posture out loud, above the commitments. */}
          {TRUST.sub ? (
            <p data-testid="trust-statement" className="mt-4 max-w-3xl text-[17px] leading-[26px] text-ink2">
              {TRUST.sub}
            </p>
          ) : null}
        </SectionHead>

        <ul className="ruled-index ruled-index-4 mt-10">
          {TRUST.items.map((item, i) => (
            <Item key={item.label} {...item} index={i} />
          ))}
        </ul>
      </div>
    </section>
  )
}
