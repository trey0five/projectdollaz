// ActSection — one timestamped act of the school day, rendered from
// landingContent.js. Kicker + H2 + body (staggered Reveal, 0.07 steps) in one
// column, the act's visual in the other; `flip` mirrors the columns so the
// acts alternate around the center ledger spine (which runs behind at
// left-1/2 on desktop, x=26px on mobile — hence the mobile left gutter).
import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { ArrowRight } from 'lucide-react'
import Reveal from './Reveal.jsx'
import { TimestampMedallion } from './LedgerSpine.jsx'
import {
  BriefingCardMock,
  DestinationChipsMock,
  StatementPaperMock,
  TrustCardsMock,
} from './ActVisuals.jsx'
import SparkChart from './SparkChart.jsx'

const VISUALS = {
  briefing: BriefingCardMock,
  destinations: DestinationChipsMock,
  spark: SparkChart,
  statement: StatementPaperMock,
  trust: TrustCardsMock,
}

export default function ActSection({ act }) {
  const Visual = VISUALS[act.visual]
  // Scroll-spy: this act is "active" while it straddles the viewport's vertical
  // center (the -45%/-45% root margin collapses the viewport to a thin center
  // band, so exactly one act is active at a time). Active → the WHOLE section
  // floods action-blue and its text flips white — the dashboard tile-hover idiom
  // — so you can see which moment of the day you're currently reading.
  const sectionRef = useRef(null)
  const active = useInView(sectionRef, { margin: '-45% 0px -45% 0px' })
  return (
    <section
      ref={sectionRef}
      id={act.anchorId}
      aria-labelledby={`${act.id}-h2`}
      // min-h-screen + centered content: each act fills the whole viewport at
      // its reading position, so the blue flood covers the ENTIRE screen when
      // the act is active (a py-only section left white neighbor bands showing).
      className={`relative ${act.bg} flex min-h-screen scroll-mt-24 flex-col justify-center py-14 transition-shadow duration-500 sm:py-24 ${
        active ? 'shadow-[0_28px_70px_-30px_rgba(37,99,235,0.65)]' : ''
      }`}
    >
      {/* The blue flood — fills the whole act while it's the centered timeframe
          (z-0: under the spine, medallion, and content). */}
      <motion.span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0"
        style={{ background: 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 55%, #1E40AF 100%)' }}
        initial={false}
        animate={{ opacity: active ? 1 : 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      />
      <TimestampMedallion time={act.time} active={active} />
      {/* z-[2]: content above the z-[1] spine (which is above section grounds). */}
      <div className="relative z-[2] mx-auto grid max-w-6xl gap-12 px-5 pl-14 pt-8 sm:px-8 sm:pl-16 sm:pt-12 lg:grid-cols-2 lg:items-center lg:gap-20 lg:px-8 lg:pt-20">
        <div className={act.flip ? 'lg:order-2' : ''}>
          <Reveal>
            {/* Deep gold on light grounds — #b89650 on cream is ~2.6:1 (fails
                AA); #7a5e00 is the codebase's readable gold-on-light shade.
                Flips white over the blue flood while this act is active. */}
            <p
              className={`text-[12px] font-bold uppercase tracking-[0.22em] transition-colors duration-300 ${
                active ? 'text-white' : 'text-[#7a5e00]'
              }`}
            >
              {act.kicker}
            </p>
          </Reveal>
          <Reveal delay={0.07}>
            <h2
              id={`${act.id}-h2`}
              className={`mt-3 font-serif text-[32px] font-semibold leading-tight transition-colors duration-300 sm:text-[42px] ${
                active ? 'text-white' : 'text-navy'
              }`}
            >
              {act.h2}
            </h2>
          </Reveal>
          <Reveal delay={0.14}>
            <p
              className={`mt-4 text-[16px] leading-relaxed transition-colors duration-300 ${
                active ? 'text-white/85' : 'text-muted'
              }`}
            >
              {act.body}
            </p>
          </Reveal>
          {act.chips && (
            <Reveal delay={0.21}>
              <ul className="mt-5 flex flex-wrap gap-2">
                {act.chips.map((chip) => (
                  <li
                    key={chip}
                    className={`rounded-full border px-3 py-1 text-[13px] font-semibold transition-colors duration-300 ${
                      active
                        ? 'border-white/35 bg-white/15 text-white'
                        : 'border-rule bg-white text-navy'
                    }`}
                  >
                    {chip}
                  </li>
                ))}
              </ul>
            </Reveal>
          )}
          {act.rows && (
            <Reveal delay={0.21}>
              <ul
                className={`mt-6 border-b transition-colors duration-300 ${
                  active ? 'border-white/30' : 'border-rule/60'
                }`}
              >
                {act.rows.map((row) => (
                  <li
                    key={row}
                    className={`group flex items-center justify-between gap-3 border-t py-3 text-[15px] font-semibold transition-colors duration-300 ${
                      active ? 'border-white/30 text-white' : 'border-rule/60 text-navy'
                    }`}
                  >
                    {row}
                    <ArrowRight
                      size={16}
                      aria-hidden="true"
                      className={`shrink-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100 motion-reduce:opacity-100 ${
                        active ? 'text-white' : 'text-gold'
                      }`}
                    />
                  </li>
                ))}
              </ul>
            </Reveal>
          )}
        </div>
        <Reveal delay={0.14} className={act.flip ? 'lg:order-1' : ''}>
          <Visual />
        </Reveal>
      </div>
    </section>
  )
}
