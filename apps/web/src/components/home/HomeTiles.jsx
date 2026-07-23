// ─────────────────────────────────────────────────────────────────────────────
// HomeTiles — the HOME v2 tile dashboard (ui.v2 flag ON). The home becomes a
// map: BriefingBand → module tile grid; the narrated morning brief opens as a
// POPUP (BriefingModal) from the band's ▶ Play / "Open the briefing". The old
// core row is gone (it duplicated the global top nav).
//
// GATES mirror HomeDashboard exactly: org scope renders <OrgHome/> unchanged
// (same branch position), entitlement-paused renders the paused panel, loading
// renders tile-shaped skeletons, and an EMPTY school still renders the tile map
// (recognition nav on day one) with chips suppressed + the band's onboarding CTA.
//
// DATA: one useBriefing(schoolId, latestPeriodId) fetch — the period pinned the
// SAME way AppShell pins the sidebar-badge period ((periods||[]).find(hasSnapshot))
// so tile chips ≡ sidebar badges by construction. Per-tile counts come from the
// shared summariseBadges reducer (useNavBadges.js) over TILE_SOURCES. Zero new
// endpoints.
//
// TILE STATES (tri-state hasModule, === false only — avoids the billing-load
// upsell flash): licensed + routed → active tile; unlicensed → Add-ons-style
// upsell tile (page-less modules included); licensed but page-less → no tile.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { useSchools } from '../../context/SchoolContext.jsx'
import { useScope } from '../../context/ScopeContext.jsx'
import { useBilling } from '../../context/BillingContext.jsx'
import { usePersistence } from '../../context/PersistenceContext.jsx'
import { useBriefing } from '../../hooks/useBriefing.js'
import { summariseBadges } from '../../hooks/useNavBadges.js'
import EntitlementPausedPanel from '../analytics/EntitlementPausedPanel.jsx'
import OrgTiles from './OrgTiles.jsx'
import PennyMorningBrief from './PennyMorningBrief.jsx'
import BriefingBand from './BriefingBand.jsx'
import BriefingModal from './BriefingModal.jsx'
import ModuleTile from './ModuleTile.jsx'
import { schoolHue } from './SchoolTile.jsx'
import PennyTile from './PennyTile.jsx'
import HomeVitalsStrip from './HomeVitalsStrip.jsx'
import { HOME_TILES, TILE_SOURCES } from './tileRegistry.jsx'
import '../../styles/home-tiles.css'

// Jul–Jun fiscal year containing a period end date → its 'YYYY-07' FY key.
// Mirrors HomeDashboard/BudgetPage so School↔Org resolve the same FY.
function deriveFiscalYearStart(periodEndDate) {
  if (!periodEndDate) return null
  const [y, m] = periodEndDate.split('-').map(Number)
  if (!y || !m) return null
  return `${m <= 6 ? y - 1 : y}-07`
}

function TileSkeleton() {
  return (
    <div className="h-[190px] animate-pulse rounded-[18px] border border-navy/5 bg-white/70">
      <div className="p-5">
        <div className="h-[60px] w-[60px] rounded-[15px] bg-navy/5" />
        <div className="mt-4 h-4 w-2/5 rounded bg-navy/10" />
        <div className="mt-2 h-3 w-4/5 rounded bg-navy/5" />
      </div>
    </div>
  )
}

export default function HomeTiles() {
  const { activeSchool } = useSchools()
  const { scope, orgId, orgName, hasOrg, isMultiSchool, orgSchoolCount } = useScope()
  const orgMode = scope === 'org' && hasOrg && !!orgId
  // Org mode parks the per-school hooks (null id → no-op) and renders <OrgHome/>.
  const schoolId = orgMode ? null : activeSchool?.id ?? null
  const { loading: billingLoading, entitled, hasModule } = useBilling()
  const { periods, hydrating } = usePersistence()

  const savedPeriods = useMemo(() => (periods || []).filter((p) => p.hasSnapshot), [periods])

  // The v2 home has no period selector — the scoreboard is pinned to the newest
  // saved period via the EXACT derivation AppShell's sidebar badges use, so the
  // tile chips and the nav badges read from the same briefing by construction.
  const latestPeriodId = (periods || []).find((p) => p.hasSnapshot)?.id ?? null

  // Morning-brief popup: null (closed) | 'open' | 'narrate' (autoplay on open).
  const [brief, setBrief] = useState(null)

  // OrgHome still owns a period selector — same microtask-deferred default as
  // HomeDashboard (react-hooks/set-state-in-effect sanctioned pattern).
  const [selectedPeriodId, setSelectedPeriodId] = useState(null)
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      if (savedPeriods.length === 0) {
        setSelectedPeriodId((cur) => (cur === null ? cur : null))
      } else {
        setSelectedPeriodId((cur) =>
          savedPeriods.some((p) => p.id === cur) ? cur : savedPeriods[0].id,
        )
      }
    })
    return () => {
      cancelled = true
    }
  }, [savedPeriods])

  // ONE briefing fetch for the whole surface (band + tile chips + Tasks count).
  const {
    summary: briefingSummary,
    items: briefingItems,
    lens: briefingLens,
    loading: briefingLoading,
    error: briefingError,
    notEntitled,
  } = useBriefing(schoolId, latestPeriodId)

  const badges = useMemo(() => summariseBadges(briefingItems, TILE_SOURCES), [briefingItems])

  // ── Organization scope: the org TILE home (tiles + consolidated detail),
  // JwtAuth-only — deliberately ABOVE the per-school entitlement gate, like
  // HomeDashboard/OrgHome always were. ──
  if (orgMode) {
    const selectedPeriod =
      savedPeriods.find((p) => p.id === selectedPeriodId) ?? savedPeriods[0] ?? null
    return (
      <OrgTiles
        orgId={orgId}
        orgName={orgName}
        orgSchoolCount={orgSchoolCount}
        fiscalYearStart={deriveFiscalYearStart(selectedPeriod?.periodEndDate)}
        periods={savedPeriods}
        selectedPeriodId={selectedPeriod?.id ?? null}
        onSelectPeriod={setSelectedPeriodId}
      />
    )
  }

  // ── Entitlement gate (mirror HomeDashboard; 402 from the briefing counts). ──
  if (!billingLoading && (!entitled || notEntitled)) {
    return (
      <div className="mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8">
        <EntitlementPausedPanel />
      </div>
    )
  }

  // ── Loading: tile-shaped skeletons. ─────────────────────────────────────────
  if (billingLoading || hydrating) {
    return (
      <div className="mx-auto max-w-page space-y-5 px-4 py-6 sm:px-10 sm:py-8">
        <div className="h-40 animate-pulse rounded-2xl bg-navy/10" />
        <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <TileSkeleton key={i} />
          ))}
        </div>
      </div>
    )
  }

  const hasPeriod = latestPeriodId !== null
  // Chips show real numbers only once the briefing has answered; before/without
  // it (no period, still loading, errored) they render the neutral "—".
  const chipsReady = hasPeriod && !briefingLoading && !briefingError

  // Registry order; tri-state per tile (see header).
  const tiles = HOME_TILES.map((tile) => {
    const locked = entitled && hasModule(tile.key) === false
    if (locked) return { tile, locked: true }
    // Licensed page-less: keep the tile when it declares a surface deep-link
    // (a purchase must never vanish); drop it only if there is nowhere to go.
    if (!tile.route && !tile.surface) return null
    return { tile, locked: false }
  }).filter(Boolean)

  return (
    <div className="home-ground mx-auto max-w-page space-y-5 px-4 py-6 sm:space-y-7 sm:px-10 sm:py-8">
      <BriefingBand
        summary={briefingSummary}
        lens={briefingLens}
        hasPeriod={hasPeriod}
        onOpenBrief={setBrief}
        // School scope → the top-3 performer cards fetch metrics/trends against
        // the active school's latest snapshot period.
        schoolId={schoolId}
        periodId={latestPeriodId}
        // In a multi-school org, tint the band as frosted glass in this school's
        // identity colour (same as its org tile) and show the school name.
        hue={isMultiSchool ? schoolHue(activeSchool?.id) : null}
        schoolTitle={isMultiSchool ? activeSchool?.name : null}
      />

      <nav aria-label="Modules">
        <ul role="list" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
          {tiles.map(({ tile, locked }, i) => (
            <ModuleTile
              key={tile.key}
              tile={tile}
              badge={badges[tile.key]}
              ready={chipsReady}
              locked={locked}
              index={i}
              onShowAttention={() => setBrief('open')}
            />
          ))}
          {/* The 8th tile: Penny Studio — always present (core, not a module). */}
          <PennyTile index={tiles.length} />
        </ul>
      </nav>

      {/* Live scoreboard under the map — fills the fold with real numbers.
          Fail-soft: renders nothing until the period's metrics answer. */}
      <HomeVitalsStrip schoolId={schoolId} periodId={latestPeriodId} />

      {/* The narrated morning brief — a POPUP now. ▶ Play opens with autoNarrate
          (the modal dispatches 'penny:narrate' after the brief mounts). */}
      <BriefingModal
        open={!!brief}
        autoNarrate={brief === 'narrate'}
        onClose={() => setBrief(null)}
      >
        <PennyMorningBrief
          scope="school"
          schoolId={schoolId}
          periodId={latestPeriodId}
          lens={briefingLens}
        />
      </BriefingModal>
    </div>
  )
}
