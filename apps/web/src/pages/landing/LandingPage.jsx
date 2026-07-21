// ─────────────────────────────────────────────────────────────────────────────
// LandingPage — the public marketing homepage at "/". Composition (2026-07
// redesign): video + hero/Penny demo stay; everything beneath is now the ORBIT
// set-piece (pinned 3-D system — eight domains dock into Penny and collapse
// into the briefing) followed by the live BENTO wall (current platform truths,
// every cell running its micro-demo), then the diocese band, licensing note and
// the 7:02 finale. The old day-timeline acts (LedgerSpine/ActSection/
// IngestScrolly/DomainPlates) are retired from the composition but kept in the
// tree for reference. Default export, loaded via React.lazy from App.jsx.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useState } from 'react'
import LandingNav from './LandingNav.jsx'
import LandingHero from './LandingHero.jsx'
import VideoHero from './VideoHero.jsx'
import OrbitScrolly from './OrbitScrolly.jsx'
import BentoWall from './BentoWall.jsx'
import DioceseBand from './DioceseBand.jsx'
import FinalCta from './FinalCta.jsx'
import LandingFooter from './LandingFooter.jsx'
import TrustBar from './TrustBar.jsx'
import Reveal from './Reveal.jsx'
import { LICENSING } from './landingContent.js'

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
  // The fixed nav stays hidden until the hero's TV-bloom "powers on". The
  // callback is memoized so the hero's reveal timer isn't reset each phase.
  const [navShown, setNavShown] = useState(false)
  const revealNav = useCallback(() => setNavShown(true), [])

  return (
    // Root ground is DARK now: the hero's transparent straddle block used to
    // reveal cream between the video and the acts — with the Orbit composition
    // that read as a white gap, so the root matches the orbit's deep space.
    <div className="bg-[#070d1d] text-ink">
      <LandingNav show={navShown} />
      <main id="main">
        {/* The product video OPENS the page (cinematic entrance); the headline
            hero now plays second, under it. VideoHero also reveals the fixed nav
            so it doesn't wait for the below-the-fold hero intro. */}
        <VideoHero onShown={revealNav} />
        <LandingHero onIntroOpen={revealNav} />
        {/* The set-piece: eight domains dock into Penny, then collapse into the
            morning briefing. */}
        <OrbitScrolly />
        {/* The breadth: every current capability as a live bento cell. */}
        <BentoWall />
        <DioceseBand />
        <LicensingSection />
        <FinalCta />
      </main>
      <TrustBar />
      <LandingFooter />
    </div>
  )
}
