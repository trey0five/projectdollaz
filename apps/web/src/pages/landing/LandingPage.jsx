// ─────────────────────────────────────────────────────────────────────────────
// LandingPage — "The Morning Ledger": the public marketing homepage at "/".
// One school day told as a ledger — timestamped acts down a scroll-drawn gold
// spine, parchment ground with navy bookends. Composition only; all copy lives
// in landingContent.js. Default export, loaded via React.lazy from App.jsx so
// authed users never download it.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useRef, useState } from 'react'
import LandingNav from './LandingNav.jsx'
import LandingHero from './LandingHero.jsx'
import VideoHero from './VideoHero.jsx'
import LedgerSpine from './LedgerSpine.jsx'
import ActSection from './ActSection.jsx'
import IngestScrolly from './IngestScrolly.jsx'
import DomainPlates from './DomainPlates.jsx'
import DioceseBand from './DioceseBand.jsx'
import FinalCta from './FinalCta.jsx'
import LandingFooter from './LandingFooter.jsx'
import Reveal from './Reveal.jsx'
import { ACTS, LICENSING } from './landingContent.js'

// Quiet centered licensing note between the diocese band and the finale.
function LicensingSection() {
  return (
    <section aria-labelledby="licensing-h3" className="bg-cream py-20">
      <div className="mx-auto max-w-2xl px-5 text-center sm:px-8">
        <Reveal>
          {/* Deep gold: readable gold-on-light (see the ActSection kicker note). */}
          <p className="text-[12px] font-bold uppercase tracking-[0.22em] text-[#7a5e00]">
            {LICENSING.kicker}
          </p>
        </Reveal>
        <Reveal delay={0.07}>
          <h3
            id="licensing-h3"
            className="mt-3 font-serif text-[26px] font-semibold leading-tight text-navy sm:text-[30px]"
          >
            {LICENSING.h3}
          </h3>
        </Reveal>
        <Reveal delay={0.14}>
          <p className="mt-4 text-[16px] leading-relaxed text-muted">{LICENSING.body}</p>
        </Reveal>
      </div>
    </section>
  )
}

export default function LandingPage() {
  // The acts container the ledger spine measures its scroll-draw against.
  const actsRef = useRef(null)
  // The fixed nav stays hidden until the hero's TV-bloom "powers on". The
  // callback is memoized so the hero's reveal timer isn't reset each phase.
  const [navShown, setNavShown] = useState(false)
  const revealNav = useCallback(() => setNavShown(true), [])

  return (
    <div className="bg-cream text-ink">
      <LandingNav show={navShown} />
      <main id="main">
        {/* The product video OPENS the page (cinematic entrance); the headline
            hero now plays second, under it. VideoHero also reveals the fixed nav
            so it doesn't wait for the below-the-fold hero intro. */}
        <VideoHero onShown={revealNav} />
        <LandingHero onIntroOpen={revealNav} />
        {/* Acts I–VI share one relative container so the spine spans them all. */}
        {/* Lengthened at the top: the straddling glass card's lower half overlaps
            this cream ground, so Act I's own content starts below it. */}
        <div ref={actsRef} className="relative pt-40 sm:pt-52 lg:pt-64">
          <LedgerSpine containerRef={actsRef} />
          {ACTS.slice(0, 4).map((act) =>
            // Act II plays as the pinned scroll-driven set-piece (the hand-off:
            // folder → Penny → platform); the other acts keep the two-column form.
            act.id === 'act-2' ? (
              <IngestScrolly key={act.id} act={act} />
            ) : (
              <ActSection key={act.id} act={act} />
            ),
          )}
          <DomainPlates />
          <ActSection act={ACTS[4]} />
        </div>
        <DioceseBand />
        <LicensingSection />
        <FinalCta />
      </main>
      <LandingFooter />
    </div>
  )
}
