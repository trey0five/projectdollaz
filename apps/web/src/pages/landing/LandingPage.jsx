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
import TbToStatements from './TbToStatements.jsx'
import BoardReadyShow from './BoardReadyShow.jsx'
import FinalCta from './FinalCta.jsx'
import LandingFooter from './LandingFooter.jsx'
import TrustBar from './TrustBar.jsx'

export default function LandingPage() {
  // The fixed nav stays hidden until the hero's TV-bloom "powers on". The
  // callback is memoized so the hero's reveal timer isn't reset each phase.
  const [navShown, setNavShown] = useState(false)
  const revealNav = useCallback(() => setNavShown(true), [])

  return (
    // Light-blue page ground: the hero's transparent straddle block used to
    // reveal the root between the video and the orbit; the whole page body now
    // shares the orbit's light-blue ground (navs/footer keep their navy).
    <div className="bg-[#e9f0fb] text-ink">
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
        {/* TB → four statements, with the auto-cycling live example. */}
        <TbToStatements />
        {/* The board-ready path: slideshow + the demo packet. */}
        <BoardReadyShow />
        <FinalCta />
      </main>
      <TrustBar />
      <LandingFooter />
    </div>
  )
}
