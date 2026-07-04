// ActSection — one timestamped act of the school day, rendered from
// landingContent.js. Kicker + H2 + body (staggered Reveal, 0.07 steps) in one
// column, the act's visual in the other; `flip` mirrors the columns so the
// acts alternate around the center ledger spine (which runs behind at
// left-1/2 on desktop, x=26px on mobile — hence the mobile left gutter).
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
  return (
    <section
      id={act.anchorId}
      aria-labelledby={`${act.id}-h2`}
      className={`relative ${act.bg} scroll-mt-24 py-24`}
    >
      <TimestampMedallion time={act.time} />
      {/* z-[2]: content above the z-[1] spine (which is above section grounds). */}
      <div className="relative z-[2] mx-auto grid max-w-6xl gap-12 px-5 pl-14 pt-12 sm:px-8 sm:pl-16 lg:grid-cols-2 lg:items-center lg:gap-20 lg:px-8 lg:pt-20">
        <div className={act.flip ? 'lg:order-2' : ''}>
          <Reveal>
            {/* Deep gold on light grounds — #b89650 on cream is ~2.6:1 (fails
                AA); #7a5e00 is the codebase's readable gold-on-light shade. */}
            <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#7a5e00]">
              {act.kicker}
            </p>
          </Reveal>
          <Reveal delay={0.07}>
            <h2
              id={`${act.id}-h2`}
              className="mt-3 font-serif text-[32px] font-semibold leading-tight text-navy sm:text-[42px]"
            >
              {act.h2}
            </h2>
          </Reveal>
          <Reveal delay={0.14}>
            <p className="mt-4 text-[16px] leading-relaxed text-muted">{act.body}</p>
          </Reveal>
          {act.chips && (
            <Reveal delay={0.21}>
              <ul className="mt-5 flex flex-wrap gap-2">
                {act.chips.map((chip) => (
                  <li
                    key={chip}
                    className="rounded-full border border-rule bg-white px-3 py-1 text-[13px] font-semibold text-navy"
                  >
                    {chip}
                  </li>
                ))}
              </ul>
            </Reveal>
          )}
          {act.rows && (
            <Reveal delay={0.21}>
              <ul className="mt-6 border-b border-rule/60">
                {act.rows.map((row) => (
                  <li
                    key={row}
                    className="group flex items-center justify-between gap-3 border-t border-rule/60 py-3 text-[15px] font-semibold text-navy"
                  >
                    {row}
                    <ArrowRight
                      size={16}
                      aria-hidden="true"
                      className="shrink-0 text-gold opacity-0 transition-opacity duration-300 group-hover:opacity-100 motion-reduce:opacity-100"
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
