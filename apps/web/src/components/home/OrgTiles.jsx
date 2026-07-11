// ─────────────────────────────────────────────────────────────────────────────
// OrgTiles — the HOME v2 tile dashboard at ORGANIZATION scope. The org twin of
// HomeTiles: the whole-org briefing band → the SAME module tile grid (chips now
// count cross-school attention, aggregated from the org briefing) → the core row,
// then the consolidated detail that OrgHome always showed (KPI strip + per-school
// table + narrated org brief + the multi-school triage board).
//
// It reuses OrgHome's proven org hooks (useOrgBriefing / useOrgMetrics) and its
// child components verbatim — nothing new server-side. Tiles navigate to each
// module exactly as the sidebar did in org scope (the module page resolves the
// active school); the org value on the tile is the recognition cue "where across
// the org needs attention".
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { Layers } from 'lucide-react'
import { useBilling } from '../../context/BillingContext.jsx'
import { useOrgBriefing, useOrgMetrics } from '../../hooks/useAnalytics.js'
import { summariseBadges } from '../../hooks/useNavBadges.js'
import OrgKpiStrip from '../budget/OrgKpiStrip.jsx'
import OrgSchoolsTable from '../budget/OrgSchoolsTable.jsx'
import OrgBriefing from '../budget/OrgBriefing.jsx'
import PennyMorningBrief from './PennyMorningBrief.jsx'
import BriefingBand from './BriefingBand.jsx'
import ModuleTile from './ModuleTile.jsx'
import CoreRow from './CoreRow.jsx'
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
  const reduce = useReducedMotion()
  const { hasModule } = useBilling()
  // Owner-only "preview as" lens, same as OrgHome (org briefing is JwtAuth-only).
  const [previewLens, setPreviewLens] = useState(null)

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
    if (!tile.route) return null
    return { tile, locked: false }
  }).filter(Boolean)

  const taskCount = chipsReady ? badges.workflow?.count ?? 0 : 0
  const fy = fyLabel(fiscalYearStart)

  return (
    <div className="mx-auto max-w-[1100px] space-y-5 px-4 py-6 sm:space-y-7 sm:px-10 sm:py-8">
      {/* Org briefing band — the org twin of the school hero. "Across your N
          schools" reads through BriefingBand's schoolName slot. */}
      <BriefingBand
        schoolName={`your ${orgSchoolCount} school${orgSchoolCount === 1 ? '' : 's'}`}
        summary={summary}
        badges={chipsReady ? badges : {}}
        lens={lens}
        hasPeriod
      />

      <nav aria-label="Modules">
        <ul role="list" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
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
        </ul>
      </nav>

      <CoreRow hasModule={hasModule} taskCount={taskCount} />

      {/* ── Consolidated detail (everything OrgHome showed) ─────────────────── */}
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="card-soft flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-center sm:gap-5 sm:px-7 sm:py-6"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-glow">
          <Layers size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-gold">
            Organization · consolidated
          </p>
          <h2 className="truncate py-0.5 font-serif text-xl font-semibold leading-[1.35] text-navy sm:text-2xl">
            {orgName || 'Organization'}
          </h2>
          <p className="text-[13px] text-muted">
            Rolled up across {orgSchoolCount} schools{fy ? ` · ${fy}` : ''}.
          </p>
        </div>
        {periods.length > 0 && (
          <label className="flex shrink-0 flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">
            Fiscal year
            <select
              value={selectedPeriodId ?? ''}
              onChange={(e) => onSelectPeriod?.(e.target.value)}
              className="min-h-[40px] rounded-lg border-2 border-hair bg-white px-3 text-[14px] font-medium normal-case tracking-normal text-navy outline-none ring-gold/40 focus-visible:ring-2"
            >
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label || p.periodEndDate || p.id}
                </option>
              ))}
            </select>
          </label>
        )}
      </motion.div>

      <OrgKpiStrip metrics={metrics} loading={metricsLoading} error={metricsError} />

      {briefing && <OrgSchoolsTable schools={briefing.schools || []} />}

      {/* The band's ▶ Play / "Open the briefing" land here (penny:narrate + the
          #home-morning-brief scroll target), org scope. */}
      <div id="home-morning-brief" className="scroll-mt-20">
        <PennyMorningBrief scope="org" orgId={orgId} fiscalYearStart={fiscalYearStart} lens={lens} />
      </div>

      <OrgBriefing
        briefing={briefing}
        loading={briefingLoading}
        error={briefingError}
        lens={lens}
        callerRole={callerRole}
        availableLenses={availableLenses}
        onLensChange={setPreviewLens}
      />
    </div>
  )
}
