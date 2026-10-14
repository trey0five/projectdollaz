// ─────────────────────────────────────────────────────────────────────────────
// AcademicsPage — the classroom command center: assessments, gradebook and
// lesson plans, with a full diocesan dashboard on its own Analytics tab.
//
// Academics is the first module whose analysis is too large for the Overview
// tab — it is a whole leadership deck, not a KPI strip — so it earns the new
// `analytics` tab rather than cramming the overview or spawning a sibling page.
//
// Everything on the dashboard is computed server-side by the pure assessment
// layer; this page fetches one payload and paints it.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { BookOpen } from 'lucide-react'
import ModuleTabs, { ModuleAccent, useModuleTab } from '../components/module/ModuleTabs.jsx'
import { moduleTabs } from '../components/module/moduleAnatomy.js'
import { useScope } from '../context/ScopeContext.jsx'
import ModuleHero from '../components/module/ModuleHero.jsx'
import AddDataTab from '../components/wizard/AddDataTab.jsx'
import AssessmentDashboard, { VIEWS } from '../components/academics/AssessmentDashboard.jsx'
import AcademicsOverview from '../components/academics/AcademicsOverview.jsx'
import LessonPlanRegister from '../components/academics/LessonPlanRegister.jsx'
import GradesPanel from '../components/academics/GradesPanel.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { academicsApi } from '../lib/api.js'

const HUE = '#0D9488'
const EASE = [0.2, 0.8, 0.2, 1]

export default function AcademicsPage() {
  const { isMultiSchool } = useScope()
  const { activeId, activeSchool } = useSchools()
  // The sidebar drives ?tab= for every module; this page only reads it (and
  // writes it from the Overview's own door into the dashboard).
  const [activeTab, setTab] = useModuleTab(moduleTabs('academics'))

  // The analysis sub-view is the deepest thing a reader can be looking at, so
  // it belongs in the trail — "Analytics" alone does not distinguish the cohort
  // slopegraph from the board table. Only meaningful on the analytics tab.
  // Only for a view that is actually SELECTED. Defaulting this to 'Standing'
  // appended a crumb on the bare Analytics tab, which pushed "Analytics" into
  // the middle of the trail and made it the back arrow's target — so the arrow
  // navigated to the page it was already on and the reader could not get out.
  // Standing is where Analytics lands, not a place below it, and the dashboard
  // clears ?view= for exactly that reason.
  const [searchParams] = useSearchParams()
  const rawView = searchParams.get('view')
  const viewCrumb =
    activeTab === 'analytics' && rawView ? (VIEWS.find((v) => v.key === rawView)?.label ?? null) : null
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'

  const [status, setStatus] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [query, setQuery] = useState({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [notLicensed, setNotLicensed] = useState(false)
  const [error, setError] = useState('')

  // ── The longitudinal cohort grid, on its own route ────────────────────────
  //
  // Fetched only when the reader is actually on that view, and only with the
  // params it uses. The FRAME (test type, end year, peer anonymity) is shared
  // with the dashboard's own query so the two screens cannot disagree about
  // which dataset is on show; the window is the view's own; and PEERS live in
  // the URL, which is what keeps them genuinely opt-in — nothing asks the
  // server for another school's lines until `?peers=1` is on the address bar.
  const [cohorts, setCohorts] = useState(null)
  const [cohortQuery, setCohortQuery] = useState({})
  const [cohortsBusy, setCohortsBusy] = useState(false)
  const [cohortsError, setCohortsError] = useState('')

  const load = useCallback(
    async (q = {}) => {
      if (!activeId) return
      setBusy(true)
      try {
        const [statusRes, dashRes] = await Promise.all([
          academicsApi.status(activeId).catch(() => null),
          academicsApi.dashboard(activeId, q),
        ])
        if (statusRes) setStatus(statusRes.data ?? statusRes)
        setDashboard(dashRes.data ?? dashRes)
        setNotLicensed(false)
        setError('')
      } catch (e) {
        if (e?.response?.status === 402) setNotLicensed(true)
        else setError(e?.response?.data?.message ?? 'Could not load academics.')
      } finally {
        setLoading(false)
        setBusy(false)
      }
    },
    [activeId],
  )

  // Reset the filters when the SCHOOL changes: last school's year/test/grade
  // almost certainly do not exist at the next one, so carrying them over asks
  // the API for a slice that is empty and shows "no data" for a school that has
  // plenty. `load` is keyed on activeId, so this fires exactly on a swap.
  // The cohort payload rides along for the same reason: a different school is a
  // different set of grades and therefore a different set of cohorts, so the
  // window picked against the last one cannot survive the swap.
  useEffect(() => {
    setLoading(true)
    setQuery({})
    setCohorts(null)
    setCohortQuery({})
    load({})
  }, [load]) // eslint-disable-line react-hooks/exhaustive-deps

  const onQuery = useCallback(
    (patch) => {
      const next = { ...query, ...patch }
      // null is an explicit CLEAR (see the test-type select), '' and undefined
      // are an absent value — all three drop the key rather than sending it.
      for (const k of Object.keys(next)) {
        if (next[k] === undefined || next[k] === '' || next[k] === null) delete next[k]
      }
      setQuery(next)
      load(next)
    },
    [query, load],
  )

  const onCohorts = activeTab === 'analytics' && rawView === 'cohorts'
  const peersOn = searchParams.get('peers') === '1'

  const cohortParams = useMemo(() => {
    const p = {
      testType: query.testType,
      // The year control is the END-YEAR ANCHOR here: every panel finishes in
      // the same year, which is what makes them comparable side by side.
      schoolYear: query.schoolYear,
      // The scope bar's Subject chip IS the series selector on this view;
      // absent means the publisher's reported Total Battery.
      series: query.subject,
      hidePeerNames: query.hidePeerNames,
      window: cohortQuery.window,
      endGrade: cohortQuery.endGrade,
      scope: peersOn ? 'org' : undefined,
    }
    for (const k of Object.keys(p)) {
      if (p[k] === undefined || p[k] === '' || p[k] === null) delete p[k]
    }
    return p
  }, [query, cohortQuery, peersOn])

  // Serialised, so a fresh-but-equal params object cannot spin the effect.
  const cohortKey = JSON.stringify(cohortParams)

  useEffect(() => {
    if (!onCohorts || !activeId) return undefined
    let cancelled = false
    setCohortsBusy(true)
    academicsApi
      .cohorts(activeId, JSON.parse(cohortKey))
      .then((res) => {
        if (cancelled) return
        setCohorts(res.data ?? res)
        setCohortsError('')
      })
      .catch((e) => {
        if (cancelled) return
        setCohortsError(e?.response?.data?.message ?? 'Could not load the cohorts.')
      })
      .finally(() => {
        if (!cancelled) setCohortsBusy(false)
      })
    return () => {
      cancelled = true
    }
  }, [onCohorts, activeId, cohortKey])

  const onCohortQuery = useCallback((patch) => {
    setCohortQuery((prev) => {
      const next = { ...prev, ...patch }
      for (const k of Object.keys(next)) {
        if (next[k] === undefined || next[k] === '' || next[k] === null) delete next[k]
      }
      return next
    })
  }, [])

  const level = dashboard?.school?.level

  if (notLicensed) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16 text-center">
        <BookOpen size={26} className="mx-auto mb-3" style={{ color: HUE }} />
        <h1 className="font-serif text-[26px] font-semibold text-navy">Academics isn&rsquo;t on this plan yet</h1>
        <p className="mx-auto mt-2 max-w-lg text-[15px] text-muted">
          Test scores, grades and lesson plans — with every school measured against its peers, grade by grade.
          Add the Academics module to switch it on.
        </p>
      </div>
    )
  }

  return (
    <ModuleAccent moduleKey="academics">
      <ModuleTabs
        moduleKey="academics"
        trail={viewCrumb ? [viewCrumb] : []}
        overview={
          <Panel>
            <AcademicsHero
              schoolName={activeSchool?.name}
              level={level}
              status={status}
              dashboard={dashboard}
              loading={loading}
            />
            <div className="mt-5">
              {/* BEFORE the tab, not after it. A failed load leaves `dashboard`
                  and `status` null, and OverviewTab renders that as "start with
                  a scores file" with zeros in the hero — a server error reading
                  as an empty school, which invites a duplicate upload. */}
              {error ? (
                <div className="rounded-2xl border border-danger/25 bg-white p-6">
                  <p className="text-[13px] font-semibold text-danger">{error}</p>
                  <button
                    type="button"
                    onClick={() => load(query)}
                    className="mt-3 rounded-xl border border-navy/15 px-4 py-2 text-[12px] font-semibold text-navy"
                  >
                    Try again
                  </button>
                </div>
              ) : (
              <AcademicsOverview
                dashboard={dashboard}
                status={status}
                loading={loading}
                isMultiSchool={isMultiSchool}
                onOpenView={(view) => setTab('analytics', view)}
                onGoAdd={() => setTab('add')}
              />
              )}
            </div>
          </Panel>
        }
        analytics={
          <Panel>
            <AcademicsHero
              schoolName={activeSchool?.name}
              level={level}
              status={status}
              dashboard={dashboard}
              loading={loading}
            />
            <div className="mt-5">
              {/* A failed fetch used to fall through to a fully rendered
                  dashboard of em-dashes, which reads as "we measured this and
                  it is empty" rather than "we could not load it". */}
              {error ? (
                <div className="rounded-2xl border border-danger/25 bg-white p-6">
                  <p className="text-[13px] font-semibold text-danger">{error}</p>
                  <button
                    type="button"
                    onClick={() => load(query)}
                    className="mt-3 rounded-xl border border-navy/15 px-4 py-2 text-[12px] font-semibold text-navy"
                  >
                    Try again
                  </button>
                </div>
              ) : loading && !dashboard ? (
                <p className="text-[13px] text-muted">Loading the comparison…</p>
              ) : (
                <AssessmentDashboard
                  data={dashboard}
                  onQuery={onQuery}
                  loading={busy}
                  cohorts={cohorts}
                  cohortsLoading={cohortsBusy}
                  cohortsError={cohortsError}
                  onCohortQuery={onCohortQuery}
                />
              )}
            </div>
          </Panel>
        }
        addData={
          <Panel>
            {/* The wizard is the ONE door — it now carries the assessment
                upload, the gradebook upload, the lesson-plan flow and the SIS
                card. Rendering the uploader here too put the same dropzone on
                screen twice and pushed the wizard below the fold. */}
            <AddDataTab module="academics" onDone={() => load(query)} />
          </Panel>
        }
        records={
          <Panel>
            <div className="space-y-4">
              <GradesPanel schoolId={activeId} canEdit={canEdit} />
              <section className="rounded-2xl border border-navy/10 bg-white p-5">
                <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em]" style={{ color: HUE }}>
                  Lesson plans
                </p>
                <h3 className="mb-3 mt-0.5 font-serif text-[19px] font-semibold text-navy">The classroom register</h3>
                <LessonPlanRegister schoolId={activeId} canEdit={canEdit} />
              </section>
            </div>
          </Panel>
        }
      />
    </ModuleAccent>
  )
}

/** Each panel brings its own container — the ModuleTabs contract. */
function Panel({ children }) {
  return <div className="mx-auto max-w-6xl px-4 pb-16 pt-5 sm:px-10">{children}</div>
}

/** The hero — a live read on the classroom, not a title bar. */
function AcademicsHero({ schoolName, level, status, dashboard, loading }) {
  const a = status?.assessments
  const kpi = dashboard?.kpis
  const ctx = dashboard?.context

  const stats = useMemo(
    () => [
      { k: 'Average', v: kpi?.average?.value != null ? Number(kpi.average.value).toFixed(1) : '—' },
      { k: 'Rank', v: kpi?.rank?.rank ? `${kpi.rank.rank}/${kpi.rank.of}` : '—' },
      { k: 'Years on file', v: a?.years?.length ?? 0 },
      { k: 'Lesson plans', v: status?.lessonPlans?.total ?? 0 },
    ],
    [kpi, a, status],
  )

  return (
    <ModuleHero
      module="academics"
      hue={HUE}
      eyebrow={
        <>
          <BookOpen size={12} /> Academics
          {level && level !== 'unknown' ? (
            <span className="pill ml-1">{level}</span>
          ) : null}
        </>
      }
      title={`${schoolName ?? 'This school'}, measured against its peers.`}
      subtitle={
        ctx
          ? `${(ctx.testType ?? '').toUpperCase()} · ${ctx.year} · ${
              ctx.scoreType === 'percentile' ? 'national percentile' : 'scale score'
            } — grade by grade, subject by subject, against the schools around you.`
          : 'Upload a scores file and this school appears beside every other school in the network.'
      }
      stats={loading ? stats.map((st) => ({ ...st, v: '·' })) : stats}
    />
  )
}
