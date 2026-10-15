// ─────────────────────────────────────────────────────────────────────────────
// LandingPage — the public marketing homepage at "/". Premium UI P5: the app's
// "ledger" system at editorial scale. ONE ink band (the hero video + its
// straddling headline card); everything after it sits on the page ground,
// divided by hairline section rules — no frosted cards, no glass except the
// nav once scrolled, no infinite loops (the owl's idle is the one exception).
//
// Composition: video + hero/KYRO demo → the ORBIT set-piece (pinned; eight
// domains dock into KYRO and collapse into the briefing) → the platform as
// REAL product screenshots + a ruled index → TB → four statements → the cash
// forecast workbook → the network roll-up → the one-click board packet → the
// privacy statement → footer. Default export, loaded via React.lazy (App.jsx).
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
import '../../styles/pending/p5-landing.css'

export default function LandingPage() {
  // The fixed nav stays hidden until the hero video settles. The callback is
  // memoized so the hero's reveal timer isn't reset each phase.
  const [navShown, setNavShown] = useState(false)
  const revealNav = useCallback(() => setNavShown(true), [])

  return (
    <div className="bg-ground text-ink">
      <LandingNav show={navShown} />
      <main id="main">
        {/* The product video OPENS the page; the headline card straddles its
            lower edge. VideoHero also reveals the fixed nav. */}
        <VideoHero onShown={revealNav} />
        <LandingHero onIntroOpen={revealNav} />
        {/* The set-piece: eight domains dock into KYRO, then collapse into the
            morning briefing. */}
        <OrbitScrolly />
        {/* The breadth: real product screens + a ruled index of the rest. */}
        <BentoWall />
        {/* TB → four statements, stepping through once. */}
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
