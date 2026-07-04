// FinalCta — the closing navy bookend: tomorrow's 7:02 AM briefing is already
// waiting. Primary CTA gets the .card-flashy conic-ring treatment over a gold
// gradient fill (the utility bg wins over the component background).
import { Link } from 'react-router-dom'
import StudioBackdrop from '../../components/penny/studio/StudioBackdrop.jsx'
import Reveal from './Reveal.jsx'
import { FINALE } from './landingContent.js'

const FOCUS_RING = 'outline-none focus-visible:ring-2 focus-visible:ring-gold/60'

export default function FinalCta() {
  return (
    <section
      aria-labelledby="finale-h2"
      className="relative isolate overflow-hidden bg-studio-hero py-28"
    >
      <StudioBackdrop />
      <div className="relative mx-auto max-w-3xl px-5 text-center sm:px-8">
        <Reveal>
          <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-gold-light">
            {FINALE.kicker}
          </p>
        </Reveal>
        <Reveal delay={0.07}>
          <h2
            id="finale-h2"
            className="mt-3 font-serif text-[36px] font-semibold leading-tight text-white sm:text-[48px]"
          >
            {FINALE.h2}
          </h2>
        </Reveal>
        <Reveal delay={0.14}>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <Link
              to={FINALE.ctaPrimary.to}
              className={`card-flashy inline-flex items-center justify-center bg-gold-gradient px-9 py-4 text-[13px] font-bold uppercase tracking-[0.14em] text-navy-deep ${FOCUS_RING}`}
            >
              {FINALE.ctaPrimary.label}
            </Link>
            <Link
              to={FINALE.ctaGhost.to}
              className={`inline-flex items-center justify-center rounded-xl border-2 border-white/25 px-6 py-3.5 text-[13px] font-bold uppercase tracking-[0.14em] text-white transition-colors hover:border-gold/60 hover:text-gold-light ${FOCUS_RING}`}
            >
              {FINALE.ctaGhost.label}
            </Link>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
