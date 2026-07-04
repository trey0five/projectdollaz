// DioceseBand — the multi-campus pitch: five gold campus "seals" joined by a
// hairline (the center one glowing), over centered copy on a navy gradient.
import { Link } from 'react-router-dom'
import Reveal from './Reveal.jsx'
import { DIOCESE } from './landingContent.js'

const FOCUS_RING = 'outline-none focus-visible:ring-2 focus-visible:ring-gold/60'

export default function DioceseBand() {
  return (
    <section
      id="for-dioceses"
      aria-labelledby="diocese-h2"
      className="scroll-mt-24 bg-navy-gradient py-24"
    >
      <div className="mx-auto max-w-3xl px-5 text-center sm:px-8">
        <Reveal>
          <div aria-hidden="true" className="relative mx-auto flex max-w-md items-center justify-center gap-5 sm:gap-7">
            <span className="absolute left-0 right-0 top-1/2 h-px bg-gold/40" />
            {DIOCESE.seals.map((initials, i) => {
              const center = i === Math.floor(DIOCESE.seals.length / 2)
              return (
                <span
                  key={initials}
                  className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border bg-navy-deep font-serif text-[13px] text-gold-light ${
                    center ? 'border-gold shadow-glow' : 'border-gold/60'
                  }`}
                >
                  {initials}
                </span>
              )
            })}
          </div>
        </Reveal>
        <Reveal delay={0.07}>
          <p className="mt-10 text-[12px] font-bold uppercase tracking-[0.22em] text-gold-light">
            {DIOCESE.kicker}
          </p>
        </Reveal>
        <Reveal delay={0.14}>
          <h2
            id="diocese-h2"
            className="mt-3 font-serif text-[32px] font-semibold leading-tight text-white sm:text-[42px]"
          >
            {DIOCESE.h2}
          </h2>
        </Reveal>
        <Reveal delay={0.21}>
          <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-white/70">
            {DIOCESE.body}
          </p>
        </Reveal>
        <Reveal delay={0.28}>
          <Link
            to={DIOCESE.cta.to}
            className={`mt-8 inline-flex items-center justify-center rounded-xl bg-gold-gradient px-8 py-4 text-[13px] font-bold uppercase tracking-[0.14em] text-navy-deep shadow-glow transition-shadow hover:shadow-glow-lg ${FOCUS_RING}`}
          >
            {DIOCESE.cta.label}
          </Link>
        </Reveal>
      </div>
    </section>
  )
}
