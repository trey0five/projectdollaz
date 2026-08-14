// ─────────────────────────────────────────────────────────────────────────────
// OrgTiles — the HOME v2 tile dashboard at ORGANIZATION scope. The org twin of
// HomeTiles: the whole-org briefing band → the SAME module tile grid (chips now
// count cross-school attention, aggregated from the org briefing), then the
// consolidated detail that OrgHome always showed (KPI strip + per-school table +
// the multi-school triage board). The narrated org brief opens as a POPUP
// (BriefingModal) from the band; the core row is gone (duplicated the top nav).
//
// It reuses OrgHome's proven org hooks (useOrgBriefing / useOrgMetrics) and its
// child components verbatim — nothing new server-side.
//
// The consolidated ORGANIZATION VIEW (KPIs / schools / modules / needs
// attention) renders INLINE below the school tiles, visible on arrival. It spent
// a while as a popup behind an "Organization view" button on the briefing band,
// which taught the obvious in retrospect: a consolidation behind a click is a
// consolidation most people never open, and this page's whole job is that
// consolidation.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, BookOpen, LineChart, Landmark } from 'lucide-react'
import { useOrgBriefing, useOrgMetrics } from '../../hooks/useAnalytics.js'
import { useSchools } from '../../context/SchoolContext.jsx'
import { useScope } from '../../context/ScopeContext.jsx'
import { summariseBadges } from '../../hooks/useNavBadges.js'
import PennyMorningBrief from './PennyMorningBrief.jsx'
import BriefingBand from './BriefingBand.jsx'
import BriefingModal from './BriefingModal.jsx'
import OrgDetailSection from './OrgDetailSection.jsx'
import SchoolTile from './SchoolTile.jsx'
import { TILE_SOURCES } from './tileRegistry.jsx'
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
  const { setActiveSchool } = useSchools()
  const { setScope } = useScope()
  // Owner-only "preview as" lens, same as OrgHome (org briefing is JwtAuth-only).
  const [previewLens, setPreviewLens] = useState(null)
  // Morning-brief popup: null (closed) | 'open' | 'narrate' (autoplay on open).
  const [brief, setBrief] = useState(null)

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

  // The org's schools (from the briefing rollup) become the tile grid. Selecting
  // one swaps the whole app to that school's view.
  const schools = useMemo(() => briefing?.schools ?? [], [briefing])
  const goToSchool = (schoolId) => {
    if (!schoolId) return
    setActiveSchool(schoolId)
    setScope('school')
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  const fy = fyLabel(fiscalYearStart)

  return (
    <div className="home-ground mx-auto max-w-page space-y-5 px-4 py-6 sm:space-y-7 sm:px-10 sm:py-8">
      {/* Org briefing band — the org twin of the school hero. "Across your N
          schools" reads through BriefingBand's schoolName slot. */}
      <BriefingBand
        schoolName={`your ${orgSchoolCount} school${orgSchoolCount === 1 ? '' : 's'}`}
        summary={summary}
        badges={chipsReady ? badges : {}}
        lens={lens}
        hasPeriod
        onOpenBrief={setBrief}
      />

      {/* ── ACROSS THE NETWORK ───────────────────────────────────────────────
          The org-wide analyses already existed and were reachable from nowhere
          an org user would look: the academic console only from a link on ONE
          school's academics overview, the consolidated financials only by
          switching scope on another page. A superintendent lands here, and
          "every school at once" is the question they came with — so the doors
          belong on this page, above the per-school grid. */}
      <NetworkAnalytics count={orgSchoolCount} />

      {/* Jump into a school — each tile swaps the whole app to that school's
          view (setActiveSchool + school scope). One colour per school. */}
      <section aria-labelledby="org-schools-heading">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 id="org-schools-heading" className="font-serif text-lg font-semibold text-navy">
            Jump into a school
          </h2>
          <p className="text-[13px] text-muted">
            {schools.length} school{schools.length === 1 ? '' : 's'} · select one to open its dashboard
          </p>
        </div>
        {schools.length > 0 ? (
          <ul role="list" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {schools.map((school, i) => (
              <SchoolTile
                key={school.schoolId}
                school={school}
                index={i}
                ready={chipsReady}
                onSelect={goToSchool}
              />
            ))}
          </ul>
        ) : (
          <div className="card-soft border-dashed px-6 py-10 text-center">
            <p className="text-[15px] italic text-muted">
              {briefingLoading ? 'Loading your schools…' : 'No schools in this organization yet.'}
            </p>
          </div>
        )}
      </section>

      {/* The consolidated ORGANIZATION VIEW — inline and visible on arrival,
          directly under the school tiles. Tabbed (KPIs / Schools / Modules /
          Needs attention) so each section reads on its own. */}
      <OrgDetailSection
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

      {/* The narrated org brief — a POPUP now. ▶ Play opens with autoNarrate
          (the modal dispatches 'penny:narrate' after the brief mounts). */}
      <BriefingModal
        open={!!brief}
        autoNarrate={brief === 'narrate'}
        onClose={() => setBrief(null)}
      >
        <PennyMorningBrief scope="org" orgId={orgId} fiscalYearStart={fiscalYearStart} lens={lens} />
      </BriefingModal>

    </div>
  )
}

/** The network-wide doors: one per analysis that spans every school. */
function NetworkAnalytics({ count }) {
  const cards = [
    {
      to: '/academics/network',
      Icon: BookOpen,
      hue: '#0D9488',
      title: 'Academics across the network',
      body: 'Every school ranked on one screen, grade by grade — with the national and network lines drawn on.',
    },
    {
      to: '/analytics',
      Icon: LineChart,
      hue: '#2563EB',
      title: 'Financial analytics across the network',
      body: 'Margin, days cash and the rest, school by school, against the network they belong to.',
    },
    {
      to: '/budget?tab=consolidated',
      Icon: Landmark,
      hue: '#7C3AED',
      title: 'Consolidated statements',
      body: 'The four statements rolled up across every school in the organization.',
    },
  ]

  return (
    <section aria-labelledby="org-network-heading">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 id="org-network-heading" className="font-serif text-lg font-semibold text-navy">
          Across the network
        </h2>
        <p className="text-[13px] text-muted">
          All {count} school{count === 1 ? '' : 's'} at once — no switching
        </p>
      </div>

      <ul role="list" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <li key={c.to} className="list-none">
            <Link
              to={c.to}
              className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-navy/10 bg-white p-4 transition-shadow hover:shadow-[0_22px_50px_-30px_rgba(16,28,61,0.5)]"
            >
              <span
                aria-hidden="true"
                className="absolute left-0 top-0 h-full w-[3px]"
                style={{ background: `linear-gradient(180deg, ${c.hue} 0%, ${c.hue}00 100%)` }}
              />
              <span
                aria-hidden="true"
                className="absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
                style={{ background: `radial-gradient(120% 100% at 100% 0%, ${c.hue}12 0%, transparent 62%)` }}
              />
              <span className="relative flex items-start justify-between gap-2">
                <span
                  className="grid h-10 w-10 place-items-center rounded-xl"
                  style={{ background: `${c.hue}1A`, color: c.hue, boxShadow: `inset 0 0 0 1px ${c.hue}2E` }}
                >
                  <c.Icon size={17} strokeWidth={2.2} />
                </span>
                <ArrowRight
                  size={15}
                  style={{ color: c.hue }}
                  className="mt-1 transition-transform group-hover:translate-x-0.5"
                />
              </span>
              <span className="relative mt-3 block font-serif text-[16.5px] font-semibold leading-tight text-navy">
                {c.title}
              </span>
              <span className="relative mt-1 block text-[12.5px] leading-snug text-muted">{c.body}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
