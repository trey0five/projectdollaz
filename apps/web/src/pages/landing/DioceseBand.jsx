// DioceseBand — the multi-campus pitch, generic to ANY multi-school
// organization (independent-school networks, charter systems, management
// companies, dioceses). A row of campus nodes joined by a hairline, each with a
// live status dot (on-track / needs-attention); the flagged center node glows —
// the visual answer to "which schools are behind on their June close?".
import { Link } from 'react-router-dom'
import { School } from 'lucide-react'
import Reveal from './Reveal.jsx'
import { DIOCESE } from './landingContent.js'

const FOCUS_RING = 'outline-none focus-visible:ring-2 focus-visible:ring-gold/60'
const DOT = { ok: 'bg-emerald-400', behind: 'bg-amber-400' }

export default function DioceseBand() {
  const mid = Math.floor(DIOCESE.campuses.length / 2)

  return (
    <section id="networks" aria-labelledby="diocese-h2" className="scroll-mt-24 bg-navy-gradient py-24">
      <div className="mx-auto max-w-3xl px-5 text-center sm:px-8">
        <Reveal>
          <div
            aria-hidden="true"
            className="relative mx-auto flex max-w-md items-center justify-center gap-5 sm:gap-7"
          >
            <span className="absolute left-0 right-0 top-1/2 h-px bg-gold/40" />
            {DIOCESE.campuses.map((c, i) => {
              const flagged = c.status === 'behind'
              return (
                <span
                  key={i}
                  className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full border bg-navy-deep ${
                    i === mid ? 'border-gold shadow-glow' : 'border-gold/50'
                  }`}
                >
                  <School size={18} className="text-gold-light" aria-hidden />
                  {/* Live status dot. */}
                  <span
                    className={`absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-navy-deep ${DOT[c.status]} ${
                      flagged ? 'motion-safe:animate-pulse' : ''
                    }`}
                  />
                </span>
              )
            })}
          </div>
        </Reveal>

        {/* Legend so the dots read as status, not decoration. */}
        <Reveal delay={0.05}>
          <div className="mt-5 flex items-center justify-center gap-5 text-[11px] font-semibold uppercase tracking-[0.1em] text-white/50">
            {DIOCESE.legend.map((l) => (
              <span key={l.status} className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${DOT[l.status]}`} aria-hidden />
                {l.label}
              </span>
            ))}
          </div>
        </Reveal>

        <Reveal delay={0.12}>
          <p className="mt-10 text-[12px] font-bold uppercase tracking-[0.22em] text-gold-light">
            {DIOCESE.kicker}
          </p>
        </Reveal>
        <Reveal delay={0.18}>
          <h2
            id="diocese-h2"
            className="mt-3 font-serif text-[32px] font-semibold leading-tight text-white sm:text-[42px]"
          >
            {DIOCESE.h2}
          </h2>
        </Reveal>
        <Reveal delay={0.24}>
          <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-white/70">
            {DIOCESE.body}
          </p>
        </Reveal>
        <Reveal delay={0.3}>
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
