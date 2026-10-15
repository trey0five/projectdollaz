// ─────────────────────────────────────────────────────────────────────────────
// OrgAcademicsPage — the superintendent's academic console.
//
// The org endpoints (dashboard, the one-file diocesan upload) shipped with the
// module and had NO caller in the web app at all: the diocesan view — the thing
// the whole module was asked for — existed only as JSON. This is that screen.
//
// It is a DIFFERENT view from the school dashboard, not a re-skin. A school asks
// "where do we stand against the others"; a network asks "which of my schools
// needs me this month, and is the network as a whole moving". So the shape here
// is: the network's own average, then every school ranked, then who moved, then
// where each grade sits across the whole network.
//
// Nobody is anonymised. This is the superintendent's own console and these are
// their own schools — the anonymisation on the school page exists precisely
// because a school-level viewer is NOT this reader.
//
// AURORA (2026-10-15): the Academics band (org chip, the network in one plain
// sentence, the test/year/grade selects in its tools row, the network figures
// as glass cards), then "Every school" and "Who moved / each grade" as white
// cards under section strips, top/bottom/spread as tiles, and the one-file
// upload in its own section (first when the network has no results yet).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import ModuleBreadcrumb from '../components/module/ModuleBreadcrumb.jsx'
import { ModuleAccent } from '../components/module/ModuleTabs.jsx'
import { moduleHue } from '../components/module/moduleAnatomy.js'
import { ArrowUpDown, Award, BookOpen, Grid3x3, Network, School, Sigma, Upload, Users, Wrench } from 'lucide-react'
import { useScope } from '../context/ScopeContext.jsx'
import { academicsApi } from '../lib/api.js'
import { testTypeLabel } from '../lib/academicsVocab.js'
import OrgAssessmentUpload from '../components/academics/OrgAssessmentUpload.jsx'
import ColumnChart from '../components/analytics/charts/ColumnChart.jsx'
import { INK } from '../components/academics/chartKit.jsx'
import { axisUnitOf } from '../components/academics/MeasureNote.jsx'
import { DomainStatePanel } from '../components/domain/DomainCommandCenter.jsx'
import {
  AuroraHero,
  AuroraButton,
  AuroraSection,
  AuroraCard,
  AuroraTile,
  AuroraTileGrid,
  AuroraEmpty,
  AuroraLightButton,
  HowThisWorks,
  VerdictEm,
} from '../components/ui/aurora/index.js'
import '../styles/pending/aurora-enroll-acad.css'

const HUE = moduleHue('academics')

const fmt = (v, d = 1) => (v === null || v === undefined ? '—' : Number(v).toFixed(d).replace(/\.0$/, ''))
/** Axis ticks: a 2.5 step prints 52.5, never a rounded "53" whose gridline
 *  sits half a step away from where the label says it is. */
const axisTick = (v) => (Number.isInteger(v) ? String(v) : Number(v).toFixed(1))
const signed = (v, d = 1) => (v === null || v === undefined ? '—' : `${v >= 0 ? '+' : ''}${fmt(v, d)}`)

export default function OrgAcademicsPage() {
  // orgResolved gates the first fetch: SchoolContext lags on a scope swap, and
  // firing while orgId is still null renders the "not part of an organization"
  // panel to someone who very much is.
  const { orgId, orgName, orgResolved } = useScope()
  const [data, setData] = useState(null)
  const [query, setQuery] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(
    async (q = {}) => {
      if (!orgId) return
      setLoading(true)
      try {
        const res = await academicsApi.orgDashboard(orgId, q)
        setData(res.data ?? res)
        setError('')
      } catch (e) {
        setError(e?.response?.data?.message ?? 'Could not load the network results.')
      } finally {
        setLoading(false)
      }
    },
    [orgId],
  )

  useEffect(() => {
    if (orgResolved) load(query)
  }, [load, orgResolved]) // eslint-disable-line react-hooks/exhaustive-deps

  const select = (patch) => {
    const next = { ...query, ...patch }
    for (const k of Object.keys(next)) {
      if (next[k] === undefined || next[k] === '' || next[k] === null) delete next[k]
    }
    setQuery(next)
    load(next)
  }

  const ctx = data?.context
  const ranked = useMemo(() => data?.schools ?? [], [data])
  // The same two rules the school page draws, so the two consoles agree.
  const networkAvg = data?.average?.value
  const refs = [
    ctx?.nationalReference !== null && ctx?.nationalReference !== undefined
      ? { value: ctx.nationalReference, label: `National ${fmt(ctx.nationalReference, 0)}`, color: INK.national }
      : null,
    networkAvg !== null && networkAvg !== undefined
      ? { value: networkAvg, label: `Network ${fmt(networkAvg)}`, color: INK.network }
      : null,
  ].filter(Boolean)
  const unit = ctx ? axisUnitOf(ctx) : undefined

  if (!orgResolved) {
    return (
      <DomainStatePanel
        moduleKey="academics"
        title="Academics"
        eyebrow="Network"
        verdict="Loading the network…"
        icon={Network}
        text="Fetching every school's results."
        busy
      />
    )
  }

  if (!orgId) {
    return (
      <DomainStatePanel
        moduleKey="academics"
        title="Academics"
        eyebrow="Network"
        showBack
        verdict="There is no network to compare."
        icon={Network}
        text="This account is not part of a multi-school organization."
        action={
          <AuroraLightButton variant="ghost" to="/academics">
            Open your school&rsquo;s Academics
          </AuroraLightButton>
        }
      />
    )
  }

  const empty = !data || data.empty
  const top = data?.insights?.top ?? null
  const schoolsN = data?.average?.schools ?? ranked.length

  // ONE plain sentence from the network's own figures.
  const verdict = error ? (
    "We couldn't load the network's results just now."
  ) : loading && !data ? (
    'Loading the network…'
  ) : empty ? (
    'Upload one file and every school in the network appears here, ranked.'
  ) : (
    <>
      <VerdictEm>
        {schoolsN} school{schoolsN === 1 ? '' : 's'}
      </VerdictEm>
      , network average <VerdictEm>{fmt(networkAvg)}</VerdictEm>.
      {top?.schoolName ? (
        <>
          {' '}
          {top.schoolName} leads at {fmt(top.value)}.
        </>
      ) : null}
    </>
  )

  const kpis = empty
    ? null
    : [
        { key: 'avg', icon: Sigma, label: 'Network average', value: fmt(data.average?.value), caption: ctx ? testTypeLabel(ctx.testType) : null },
        { key: 'schools', icon: School, label: 'Schools', value: String(data.average?.schools ?? 0) },
        { key: 'tested', icon: Users, label: 'Students tested', value: (data.average?.tested ?? 0).toLocaleString() },
      ]

  // The view selects ride the band's tools row (restyled as compact glass).
  const tools =
    !empty && ctx ? (
      <>
        <label>
          <span className="sr-only">Test</span>
          <select
            aria-label="Test"
            value={ctx?.testType ?? ''}
            onChange={(e) => select({ testType: e.target.value, schoolYear: null, gradeLevel: null })}
            className="sel"
          >
            {(ctx?.availableTestTypes ?? []).map((t) => (
              <option key={t} value={t}>
                {testTypeLabel(t)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">School year</span>
          <select
            aria-label="School year"
            value={ctx?.year ?? ''}
            onChange={(e) => select({ schoolYear: Number(e.target.value) })}
            className="sel"
          >
            {(ctx?.years ?? []).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Grade</span>
          <select
            aria-label="Grade"
            value={ctx?.grade ?? 'all'}
            onChange={(e) => select({ gradeLevel: e.target.value })}
            className="sel"
          >
            <option value="all">All grades</option>
            {(ctx?.grades ?? []).map((g) => (
              <option key={g} value={g}>
                Grade {g}
              </option>
            ))}
          </select>
        </label>
        {loading ? <span className="text-small text-ink2">Updating…</span> : null}
      </>
    ) : null

  // ── One file, every school ──
  const uploadSection = (
    <AuroraSection
      first={empty}
      id="org-acad-upload"
      icon={Upload}
      title="One file, every school"
      subtitle="Upload the network's results"
    >
      <OrgAssessmentUpload orgId={orgId} onDone={() => load(query)} />
    </AuroraSection>
  )

  return (
    // Nested routes fall outside ModuleTabs, which is what normally sets the
    // module vars — ModuleAccent supplies them (`display: contents`).
    <ModuleAccent moduleKey="academics">
    <div className="au-scope mx-auto max-w-page px-4 py-6 pb-16 sm:px-10 sm:py-8">
      {/* The sidebar's module section only grows on an EXACT module path, so a
          nested route like this one loses it. The same trail the module pages
          carry, so there is a way back to Academics other than the browser. */}
      <div className="mb-3">
        <ModuleBreadcrumb
          crumbs={[
            { label: 'Dashboard', to: '/app' },
            { label: 'Academics', to: '/academics' },
            { label: 'Network' },
          ]}
        />
      </div>

      {/* ── The band ── */}
      <AuroraHero
        moduleKey="academics"
        school={orgName ?? null}
        eyebrow={['Network', ctx ? `${testTypeLabel(ctx.testType)} ${ctx.year}` : null].filter(Boolean).join(' · ')}
        title="Academics"
        verdict={verdict}
        actions={
          <>
            <AuroraButton variant="primary" href="#org-acad-upload" icon={<Upload size={18} aria-hidden="true" />}>
              Upload results
            </AuroraButton>
            <AuroraButton to="/academics" icon={<BookOpen size={18} aria-hidden="true" />}>
              School view
            </AuroraButton>
          </>
        }
        tools={tools}
        kpis={kpis}
      />

      {error ? (
        <div className="mt-8">
          <AuroraEmpty
            icon={Wrench}
            hue="#e11d48"
            text={error}
            action={
              <AuroraLightButton variant="ghost" onClick={() => load(query)}>
                Try again
              </AuroraLightButton>
            }
          />
        </div>
      ) : loading && !data ? (
        <div className="mt-8 h-40 animate-pulse rounded-2xl bg-ink/[.04]" aria-busy="true" />
      ) : empty ? (
        // The band already says what to do; the upload IS the one button.
        uploadSection
      ) : (
        <>
          {/* ── Every school ── */}
          <AuroraSection
            first
            icon={Network}
            title="Every school"
            subtitle={`Ranked · ${ctx?.grade === 'all' ? 'all grades' : `grade ${ctx?.grade}`}`}
            count={`${ranked.length} schools`}
          >
            <AuroraCard title="Average score, by school" subtitle="Against the national and network lines">
              <ColumnChart
                rows={ranked.map((sc) => ({
                  id: sc.schoolId,
                  label: sc.schoolName ?? 'School',
                  value: sc.value,
                  forthcoming: !!sc.forthcoming,
                  meta: [{ label: 'Rank', value: sc.rank ? `${sc.rank} of ${ranked.length}` : '—' }],
                }))}
                color={HUE}
                fit={{ range: ctx?.scoreRange, pad: 0.12, includeZero: false }}
                refs={refs}
                unit={unit}
                tickFormatter={axisTick}
                height={260}
                showValues="selective"
                ariaLabel="Every school in the network, ranked"
              />
            </AuroraCard>
          </AuroraSection>

          {/* ── Movement + grades ── */}
          <AuroraSection icon={ArrowUpDown} hue="var(--au-h2)" title="What changed" subtitle="Who moved, and where each grade sits">
            {/* Stacked, not side by side: at half width the grade chart's
                reference pills ("NETWORK 57.6", "NATIONAL 50") had no free
                corner and sat on a column. */}
            <div className="space-y-5">
              <AuroraCard title="Who moved, and which way" subtitle="Year over year">
                {(data?.movements ?? []).length === 0 ? (
                  <p className="text-small text-ink2">A second year of results lights this up.</p>
                ) : (
                  <div className="border-t border-hair">
                    {data.movements.map((m) => {
                      const tone = m.direction === 'improved' ? 'good' : m.direction === 'declined' ? 'risk' : 'neutral'
                      return (
                        <div key={m.schoolId} className="flex min-h-9 items-center gap-2.5 border-b border-hair py-1.5 text-small">
                          <span className={`mark tone-${tone}`} aria-hidden="true" />
                          <span className="min-w-0 flex-1 break-words text-ink">{m.schoolName}</span>
                          <span className="text-[11px] tabular-nums text-ink2">
                            {fmt(m.prior, 0)} → {fmt(m.current, 0)}
                          </span>
                          <span className="w-10 text-right font-semibold tabular-nums text-ink">{signed(m.change, 0)}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </AuroraCard>

              <AuroraCard title="Where each grade sits" subtitle="Across the network">
                {(data?.byGrade ?? []).length === 0 ? (
                  <p className="text-small text-ink2">No grade-level rows on file yet.</p>
                ) : (
                  <ColumnChart
                    rows={data.byGrade.map((g) => ({
                      id: String(g.grade),
                      label: `Grade ${g.grade}`,
                      value: g.average?.value ?? null,
                      formatted: fmt(g.average?.value, 0),
                      meta: [{ label: 'Tested', value: `${g.average?.tested ?? 0}` }],
                    }))}
                    color={HUE}
                    fit={{ range: ctx?.scoreRange, pad: 0.12, includeZero: false }}
                    refs={refs}
                    unit={unit}
                    tickFormatter={axisTick}
                    showValues="all"
                    height={220}
                    ariaLabel="Network average by grade"
                  />
                )}
              </AuroraCard>
            </div>
          </AuroraSection>

          {/* ── Top, bottom, spread ── */}
          {data?.insights?.top ? (
            <AuroraSection icon={Award} hue="var(--au-h3)" title="At a glance" subtitle="Top, bottom and the spread between">
              <AuroraTileGrid cols={3}>
                <AuroraTile
                  icon={Award}
                  title="Highest"
                  figure={fmt(data.insights.top?.value)}
                  desc={data.insights.top?.schoolName ?? '—'}
                />
                <AuroraTile
                  icon={School}
                  hue="var(--au-h2)"
                  title="Lowest"
                  figure={fmt(data.insights.bottom?.value)}
                  desc={data.insights.bottom?.schoolName ?? '—'}
                />
                <AuroraTile
                  icon={Grid3x3}
                  hue="var(--au-h3)"
                  title="Spread"
                  figure={fmt(data.insights.spread)}
                  desc="Top to bottom"
                />
              </AuroraTileGrid>
            </AuroraSection>
          ) : null}

          {uploadSection}
        </>
      )}

      <HowThisWorks>
        <p>
          Every school is ranked on the same test, year and grade, against the national midpoint and the network
          average drawn on the chart.
        </p>
        <p>
          A school with fewer than five scored students shows no figure — its cohort is small enough that the average
          would describe the children in it.
        </p>
      </HowThisWorks>
    </div>
    </ModuleAccent>
  )
}
