// SectionHead — the landing's editorial section opener (the PageHeader grammar
// at marketing scale): a hairline with a 2px primary rule that DRAWS once, the
// 11px caps kicker, an EB Garamond 40/44 title and the lede beside it on wide
// screens. Left-aligned, on the ground, no box. `id` goes on the h2 so each
// section's aria-labelledby keeps working.
import { motion, useReducedMotion } from 'framer-motion'
import { EASE } from './Reveal.jsx'

export default function SectionHead({ id, kicker, title, sub, children }) {
  const reduce = useReducedMotion()
  return (
    <header className="relative border-t border-hair pt-6">
      <motion.span
        aria-hidden="true"
        className="absolute left-0 top-[-1px] h-[2px] w-16 origin-left bg-[#2563EB]"
        initial={reduce ? false : { scaleX: 0 }}
        whileInView={{ scaleX: 1 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 0.48, ease: EASE }}
      />
      <p className="text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-ink2">{kicker}</p>
      <div className="mt-3 grid gap-x-12 gap-y-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
        <h2 id={id} className="font-serif text-[32px] font-medium leading-[38px] text-ink sm:text-[40px] sm:leading-[44px]">
          {title}
        </h2>
        {sub ? <p className="max-w-xl text-[17px] leading-[26px] text-ink2 lg:pt-2">{sub}</p> : null}
      </div>
      {children}
    </header>
  )
}
