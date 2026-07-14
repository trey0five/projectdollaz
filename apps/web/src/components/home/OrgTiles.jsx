// ─────────────────────────────────────────────────────────────────────────────
// OrgTiles — the HOME v2 tile dashboard at ORGANIZATION scope. The org twin of
// HomeTiles: the whole-org briefing band → the SAME module tile grid (chips now
// count cross-school attention, aggregated from the org briefing), then the
// consolidated detail that OrgHome always showed (KPI strip + per-school table +
// the multi-school triage board). The narrated org brief opens as a POPUP
// (BriefingModal) from the band; the core row is gone (duplicated the top nav).
//
// It reuses OrgHome's proven org hooks (useOrgBriefing / useOrgMetrics) and its
// child components verbatim — nothing new server-side. Tiles navigate to each
// module exactly as the sidebar did in org scope (the module page resolves the
// active school); the org value on the tile is the recognition cue "where across
// the org needs attention".
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { useBilling } from '../../context/BillingContext.jsx'
import { useOrgBriefing, useOrgMetrics } from '../../hooks/useAnalytics.js'
import { summariseBadges } from '../../hooks/useNavBadges.js'
import PennyMorningBrief from './PennyMorningBrief.jsx'
import BriefingBand from './BriefingBand.jsx'
import BriefingModal from './BriefingModal.jsx'
import OrgDetailModal from './OrgDetailModal.jsx'
import ModuleTile from './ModuleTile.jsx'
import PennyTile from './PennyTile.jsx'
import { HOME_TILES, TILE_SOURCES } from './tileRegistry.jsx'
import '../../styles/home-tiles.css'

function fyLabel(fiscalYearStart) {
  if (!fiscalYearStart) return null
  const start = Number(fiscalYearStart.split('-')[0] || NaN)
  return Number.isFinite(start) ? `FY ${start + 1}` : null
}

export default function OrgTiles({
  orgId,
  orgName,
  orgSchoolCount,
  fiscalYearStart,
  periods = [],
  selectedPeriodId,
  onSelectPeriod,
}) {
  const { hasModule } = useBilling()
  // Owner-only "preview as" lens, same as OrgHome (org briefing is JwtAuth-only).
  const [previewLens, setPreviewLens] = useState(null)
  // Morning-brief popup: null (closed) | 'open' | 'narrate' (autoplay on open).
  const [brief, setBrief] = useState(null)
  // The consolidated organization-view popup (tabbed KPIs / schools / triage).
  const [orgDetail, setOrgDetail] = useState(false)

  const {
    briefing,
    lens,
    callerRole,
    availableLenses,
    loading: briefingLoading,
    error: briefingError,
  } = useOrgBriefing(orgId, fiscalYearStart, previewLens)

  const {
    metrics,
    loading: metricsLoading,
    error: metricsError,
  } = useOrgMetrics(orgId, fiscalYearStart)

  // Cross-school attention → per-tile chips, via the SAME reducer/map the school
  // tile home uses (org briefing items carry the identical {source, severity}).
  const items = useMemo(() => briefing?.items ?? [], [briefing])
  const badges = useMemo(() => summariseBadges(items, TILE_SOURCES), [items])
  const summary = useMemo(
    () => ({ total: items.length, critical: items.filter((i) => i.severity === 'critical').length }),
    [items],
  )
  const chipsReady = !briefingLoading && !briefingError

  // Registry order; tri-state per tile exactly like HomeTiles.
  const tiles = HOME_TILES.map((tile) => {
    const locked = hasModule(tile.key) === false
    if (locked) return { tile, locked: true }
    if (!tile.route && !tile.surface) return null // page-less w/o a surface only
    return { tile, locked: false }
  }).filter(Boolean)

  const fy = fyLabel(fiscalYearStart)

  return (
    <div className="home-ground mx-auto max-w-[1240px] space-y-5 px-4 py-6 sm:space-y-7 sm:px-10 sm:py-8">
      {/* Org briefing band — the org twin of the school hero. "Across your N
          schools" reads through BriefingBand's schoolName slot. */}
      <BriefingBand
        schoolName={`your ${orgSchoolCount} school${orgSchoolCount === 1 ? '' : 's'}`}
        summary={summary}
        badges={chipsReady ? badges : {}}
        lens={lens}
        hasPeriod
        onOpenBrief={setBrief}
        onOpenOrgView={() => setOrgDetail(true)}
      />

      <nav aria-label="Modules">
        <ul role="list" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tiles.map(({ tile, locked }, i) => (
            <ModuleTile
              key={tile.key}
              tile={tile}
              badge={badges[tile.key]}
              ready={chipsReady}
              locked={locked}
              index={i}
            />
          ))}
          {/* The 8th tile: Penny Studio — always present (core, not a module). */}
          <PennyTile index={tiles.length} />
        </ul>
      </nav>

      {/* The narrated org brief — a POPUP now. ▶ Play opens with autoNarrate
          (the modal dispatches 'penny:narrate' after the brief mounts). */}
      <BriefingModal
        open={!!brief}
        autoNarrate={brief === 'narrate'}
        onClose={() => setBrief(null)}
      >
        <PennyMorningBrief scope="org" orgId={orgId} fiscalYearStart={fiscalYearStart} lens={lens} />
      </BriefingModal>

      {/* The consolidated ORGANIZATION VIEW — a tabbed popup now (KPIs / Schools /
          Needs attention), opened from the band's "Organization view" action
          instead of stacking the whole dashboard under the tile grid. */}
      <OrgDetailModal
        open={orgDetail}
        onClose={() => setOrgDetail(false)}
        orgName={orgName}
        orgSchoolCount={orgSchoolCount}
        fy={fy}
        periods={periods}
        selectedPeriodId={selectedPeriodId}
        onSelectPeriod={onSelectPeriod}
        metrics={metrics}
        metricsLoading={metricsLoading}
        metricsError={metricsError}
        briefing={briefing}
        briefingLoading={briefingLoading}
        briefingError={briefingError}
        lens={lens}
        callerRole={callerRole}
        availableLenses={availableLenses}
        onLensChange={setPreviewLens}
      />
    </div>
  )
}
