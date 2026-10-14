// ─────────────────────────────────────────────────────────────────────────────
// OrgTiles — the HOME v2 dashboard at ORGANIZATION scope. The org twin of
// HomeTiles: the whole-org briefing stage → three network `Tile`s → the schools
// as a `DataTable` (crest · school · latest FY · critical · warn · review ·
// status; a row click swaps the app to that school) → the consolidated detail
// OrgHome always showed (KPI strip + modules matrix + the triage board). The
// narrated org brief opens as a POPUP (BriefingModal) from the stage.
//
// PREMIUM UI P2 (plan sketch 2): the grid of sixteen school cards is a table
// now — a diocese reads as a register, sortable, with a 2px status mark per
// row — and the three "across the network" doors are the one card family
// that stays (Tile). No ambient wash, no card-in-card.
//
// It reuses OrgHome's proven org hooks (useOrgBriefing / useOrgMetrics) and its
// child components verbatim — nothing new server-side.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { BookOpen, LineChart, Landmark, CheckCircle2, MinusCircle } from 'lucide-react'
import { useOrgBriefing, useOrgMetrics } from '../../hooks/useAnalytics.js'
import { useSchools } from '../../context/SchoolContext.jsx'
import { useScope } from '../../context/ScopeContext.jsx'
import { summariseBadges } from '../../hooks/useNavBadges.js'
import { Page, Section, Tile, DataTable, Pill } from '../ui/surface/index.js'
import PennyMorningBrief from './PennyMorningBrief.jsx'
import BriefingBand from './BriefingBand.jsx'
import BriefingModal from './BriefingModal.jsx'
import OrgDetailSection from './OrgDetailSection.jsx'
import { SchoolMark } from './SchoolTile.jsx'
import { TILE_SOURCES } from './tileRegistry.jsx'
import '../../styles/home-tiles.css'

function fyLabel(fiscalYearStart) {
  if (!fiscalYearStart) return null
  const start = Number(fiscalYearStart.split('-')[0] || NaN)
  return Number.isFinite(start) ? `FY ${start + 1}` : null
}

// The row's 2px mark: the worst thing the school's own briefing says.
function markOf(school, ready) {
  if (!ready || !school.reported || !school.summary) return null
  const s = school.summary
  if ((s.critical ?? 0) > 0) return 'risk'
  if ((s.warn ?? 0) > 0) return 'watch'
  if ((s.info ?? 0) > 0) return 'neutral'
  return 'good'
}

const num = (v) => (v == null ? null : Number(v))

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

  const { metrics, loading: metricsLoading, error: metricsError } = useOrgMetrics(orgId, fiscalYearStart)

  // Cross-school attention → the stage summary, via the SAME reducer/map the
  // school home uses (org briefing items carry the identical {source, severity}).
  const items = useMemo(() => briefing?.items ?? [], [briefing])
  const badges = useMemo(() => summariseBadges(items, TILE_SOURCES), [items])
  const summary = useMemo(
    () => ({ total: items.length, critical: items.filter((i) => i.severity === 'critical').length }),
    [items],
  )
  const chipsReady = !briefingLoading && !briefingError

  // The org's schools (from the briefing rollup) become the register. Selecting
  // one swaps the whole app to that school's view.
  const schools = useMemo(() => briefing?.schools ?? [], [briefing])
  const goToSchool = (schoolId) => {
    if (!schoolId) return
    setActiveSchool(schoolId)
    setScope('school')
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  const fy = fyLabel(fiscalYearStart)

  const columns = useMemo(
    () => [
      {
        key: 'name',
        header: 'School',
        sortable: true,
        // A real button, so the keyboard can open a school (the row click is
        // the mouse's shortcut to the same thing).
        render: (s) => (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              goToSchool(s.schoolId)
            }}
            aria-label={`Switch to ${s.name}${s.periodLabel ? ` — ${s.periodLabel}` : ''}`}
            className="inline-flex min-w-0 items-center gap-2.5 rounded-sm text-left font-semibold text-ink outline-none focus-visible:ring-2 focus-visible:ring-navy-soft/40"
          >
            <SchoolMark schoolId={s.schoolId} name={s.name} />
            <span>{s.name}</span>
          </button>
        ),
      },
      { key: 'periodLabel', header: 'Latest FY', sortable: true, render: (s) => s.periodLabel || '—' },
      { key: 'critical', header: 'Critical', num: true, sortable: true, sortValue: (s) => num(s.summary?.critical), render: (s) => (s.summary ? s.summary.critical || '—' : '—') },
      { key: 'warn', header: 'Warn', num: true, sortable: true, sortValue: (s) => num(s.summary?.warn), render: (s) => (s.summary ? s.summary.warn || '—' : '—') },
      { key: 'info', header: 'Review', num: true, sortable: true, sortValue: (s) => num(s.summary?.info), render: (s) => (s.summary ? s.summary.info || '—' : '—') },
      {
        key: 'status',
        header: 'Status',
        render: (s) =>
          s.failed ? (
            <Pill variant="status" tone="neutral">
              <MinusCircle size={11} aria-hidden="true" /> Couldn&rsquo;t load
            </Pill>
          ) : s.reported ? (
            <Pill variant="status" tone="good">
              <CheckCircle2 size={11} aria-hidden="true" /> Reported
            </Pill>
          ) : (
            <Pill variant="status" tone="neutral">
              <MinusCircle size={11} aria-hidden="true" /> Not yet reported
            </Pill>
          ),
      },
    ],
    // Memoised once on purpose: every render() reads its ROW, not component
    // state, and goToSchool only calls the two context setters (stable for the
    // component's life) with the row's id — so a stale closure can never point
    // at a stale school. A fresh array per render would re-sort the table on
    // every briefing poll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  return (
    <>
      <Page className="home-page space-y-6 py-6 sm:space-y-8">
        {/* Org briefing stage — the org twin of the school hero. */}
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
            an org user would look. A superintendent lands here, and "every school
            at once" is the question they came with — so the doors belong on this
            page, above the per-school register. */}
        <NetworkAnalytics count={orgSchoolCount} />

        {/* Jump into a school — each row swaps the whole app to that school's
            view (setActiveSchool + school scope). */}
        <Section
          label="Schools"
          id="org-schools"
          aside={
            <span>
              {schools.length} school{schools.length === 1 ? '' : 's'}
              {fy ? ` · ${fy}` : ''} · select one to open its dashboard
            </span>
          }
        >
          <DataTable
            columns={columns}
            rows={schools}
            rowKey="schoolId"
            markOf={(s) => markOf(s, chipsReady)}
            defaultSort={{ key: 'critical', dir: 'desc' }}
            onRowClick={(s) => goToSchool(s.schoolId)}
            caption="Schools in your organization"
            empty={briefingLoading ? 'Loading your schools…' : 'No schools in this organization yet.'}
          />
        </Section>

        {/* The consolidated ORGANIZATION VIEW — inline and visible on arrival,
            directly under the register. Sectioned (KPIs / Modules / Needs
            attention) so each reads on its own. */}
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
      </Page>

      {/* The narrated org brief — a POPUP. ▶ Play opens with autoNarrate
          (the modal dispatches 'penny:narrate' after the brief mounts). */}
      <BriefingModal open={!!brief} autoNarrate={brief === 'narrate'} onClose={() => setBrief(null)}>
        <PennyMorningBrief scope="org" orgId={orgId} fiscalYearStart={fiscalYearStart} lens={lens} />
      </BriefingModal>
    </>
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
      hue: '#0EA5E9',
      title: 'Consolidated statements',
      body: 'The four statements rolled up across every school in the organization.',
    },
  ]

  return (
    <Section
      label="Across the network"
      id="org-network"
      aside={<span>All {count} school{count === 1 ? '' : 's'} at once — no switching</span>}
    >
      <ul role="list" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <li key={c.to} className="list-none">
            <Tile to={c.to} hue={c.hue} icon={<c.Icon size={22} strokeWidth={2} />} title={c.title} body={c.body} className="h-full" />
          </li>
        ))}
      </ul>
    </Section>
  )
}
