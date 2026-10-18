// ─────────────────────────────────────────────────────────────────────────────
// LandingPage — the public marketing homepage at "/". The dynamic look: the
// hero video with a dark frosted headline card straddling it, then every
// section on the light-blue page ground (#e9f0fb) with glass cards, hue glows
// and live micro-demos. Ambient loops run only under
// prefers-reduced-motion: no-preference; each has a still fallback.
//
// Composition: video + hero/KYRO demo → the ORBIT set-piece (pinned; nine
// domains dock into KYRO and collapse into the briefing) → the live bento wall
// (glassy micro-demos of today's app: briefing, analytics, QuickBooks sync,
// Ask KYRO, tasks, enrollment, board reports, strategy + the nine module tiles)
// → TB → four statements (the statement tabs auto-cycle) → the cash forecast
// workbook → the network roll-up → the one-click board packet → the privacy
// statement → footer.
// No product screenshots: every app screen is a live, fictional-data mock.
// Default export, loaded via React.lazy (App.jsx).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useState } from 'react'
import LandingNav from './LandingNav.jsx'
import LandingHero from './LandingHero.jsx'
import VideoHero from './VideoHero.jsx'
import OrbitScrolly from './OrbitScrolly.jsx'
import BentoWall from './BentoWall.jsx'
import TbToStatements from './TbToStatements.jsx'
import CashForecastCinema from './CashForecastCinema.jsx'
import OrgCommandShow from './OrgCommandShow.jsx'
import BoardReadyShow from './BoardReadyShow.jsx'
import LandingFooter from './LandingFooter.jsx'
import TrustBar from './TrustBar.jsx'

export default function LandingPage() {
  // The fixed nav stays hidden until the hero video settles. The callback is
  // memoized so the hero's reveal timer isn't reset each phase.
  const [navShown, setNavShown] = useState(false)
  const revealNav = useCallback(() => setNavShown(true), [])

  // The pre-redesign light-blue page ground (#e9f0fb) under every section.
  return (
    <div className="bg-[#e9f0fb] text-ink">
      <LandingNav show={navShown} />
      <main id="main">
        {/* The product video OPENS the page; the headline card straddles its
            lower edge. VideoHero also reveals the fixed nav. */}
        <VideoHero onShown={revealNav} />
        <LandingHero onIntroOpen={revealNav} />
        {/* The set-piece: nine domains dock into KYRO, then collapse into the
            morning briefing. */}
        <OrbitScrolly />
        {/* The breadth: a live bento of glassy micro-demos, one per module. */}
        <BentoWall />
        {/* TB → four statements; the statement tabs auto-cycle. */}
        <TbToStatements />
        {/* The self-typing QuickBooks cash forecast. */}
        <CashForecastCinema />
        {/* Six schools roll up into one superintendent view. */}
        <OrgCommandShow />
        {/* The board-ready path: the one-click packet. */}
        <BoardReadyShow />
        <TrustBar />
      </main>
      <LandingFooter />
    </div>
  )
}
