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
//
// AURORA (2026-10-15): every tab opens with the Academics band (AcademicsBand:
// one plain sentence from the rank and standing, the jobs as buttons, the
// figures as glass cards); Records is the shared ModuleRegister with two lists
// (Gradebook · Lesson plans).
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { BookOpen, Wrench } from 'lucide-react'
import ModuleTabs, { ModuleAccent, useModuleTab } from '../components/module/ModuleTabs.jsx'
import ModuleRegister from '../components/module/ModuleRegister.jsx'
import { moduleTabs, moduleHue } from '../components/module/moduleAnatomy.js'
import { useScope } from '../context/ScopeContext.jsx'
import AddDataTab from '../components/wizard/AddDataTab.jsx'
import AssessmentDashboard, { VIEWS } from '../components/academics/AssessmentDashboard.jsx'
import AcademicsOverview, { AcademicsBand } from '../components/academics/AcademicsOverview.jsx'
import { AssessmentBandTools } from '../components/academics/AssessmentFilters.jsx'
import LessonPlanRegister from '../components/academics/LessonPlanRegister.jsx'
import GradesPanel from '../components/academics/GradesPanel.jsx'
import { DomainStatePanel } from '../components/domain/DomainCommandCenter.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { academicsApi } from '../lib/api.js'
import { AuroraEmpty, AuroraLightButton } from '../components/ui/aurora/index.js'

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
  const [searchParams, setSearchParams] = useSearchParams()
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

  // Records: two lists in the shared register shell. The tab is page state
  // (ModuleRegister's contract); "+ New" opens the matching Add-data flow.
  const [recordsTab, setRecordsTab] = useState('gradebook')
  const goAdd = useCallback(
    (option = null) => {
      const next = new URLSearchParams(searchParams)
      next.set('tab', 'add')
      next.delete('view')
      if (option) next.set('add', option)
      else next.delete('add')
      setSearchParams(next)
    },
    [searchParams, setSearchParams],
  )

  if (notLicensed) {
    return (
      <DomainStatePanel
        moduleKey="academics"
        title="Academics"
        showBack
        verdict="Academics isn't on this plan yet."
        icon={BookOpen}
        text="Test scores, grades and lesson plans — with every school measured against its peers."
        sub="Add the Academics module to switch it on."
        action={
          <AuroraLightButton variant="ghost" to="/settings/billing">
            See plans
          </AuroraLightButton>
        }
      />
    )
  }

  const band = (tab) => (
    <AcademicsBand
      schoolName={activeSchool?.name}
      level={level}
      status={status}
      dashboard={error ? null : dashboard}
      loading={loading}
      tab={tab}
      networkTo={isMultiSchool ? '/academics/network' : null}
      // The analysis frame (test · year) and lens (grade · subject) ride the
      // band's tools row on Analytics, as on the Network page — only the
      // controls that bite on the open view.
      tools={
        tab === 'analytics' && !error && dashboard && !dashboard.empty ? (
          <AssessmentBandTools
            ctx={dashboard.context}
            view={VIEWS.some((v) => v.key === rawView) ? rawView : 'standing'}
            onSelect={onQuery}
            loading={busy}
          />
        ) : null
      }
    />
  )

  // A failed load must never read as an empty school (that invites a duplicate
  // upload): the band stays, and the body says what happened with one button.
  const errorPanel = error ? (
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
  ) : null

  return (
    <ModuleAccent moduleKey="academics">
      <ModuleTabs
        moduleKey="academics"
        trail={viewCrumb ? [viewCrumb] : []}
        overview={
          <Panel>
            {band('overview')}
            {/* BEFORE the tab, not after it. A failed load leaves `dashboard`
                and `status` null, and the overview renders that as "start with
                a scores file" — a server error reading as an empty school. */}
            {errorPanel ?? (
              <AcademicsOverview
                dashboard={dashboard}
                status={status}
                loading={loading}
                isMultiSchool={isMultiSchool}
                onOpenView={(view) => setTab('analytics', view)}
                onGoAdd={() => setTab('add')}
              />
            )}
          </Panel>
        }
        analytics={
          <Panel>
            {band('analytics')}
            {/* A failed fetch used to fall through to a fully rendered
                dashboard of em-dashes, which reads as "we measured this and
                it is empty" rather than "we could not load it". */}
            {errorPanel ??
              (loading && !dashboard ? (
                <div className="mt-8 h-40 animate-pulse rounded-2xl bg-ink/[.04]" aria-busy="true" />
              ) : (
                <div className="mt-8">
                  <AssessmentDashboard
                    data={dashboard}
                    onQuery={onQuery}
                    loading={busy}
                    cohorts={cohorts}
                    cohortsLoading={cohortsBusy}
                    cohortsError={cohortsError}
                    onCohortQuery={onCohortQuery}
                    onGoAdd={canEdit ? () => setTab('add') : null}
                  />
                </div>
              ))}
          </Panel>
        }
        addData={
          // The wizard is the ONE door — it carries the assessment upload, the
          // gradebook upload, the lesson-plan flow and the SIS card.
          <AddDataTab module="academics" onDone={() => load(query)} />
        }
        records={
          <ModuleRegister
            moduleKey="academics"
            hue={moduleHue('academics')}
            tabs={[
              { key: 'gradebook', label: 'Gradebook' },
              { key: 'lessons', label: 'Lesson plans' },
            ]}
            activeTab={recordsTab}
            onTabChange={setRecordsTab}
            onNew={canEdit ? () => goAdd(recordsTab === 'lessons' ? 'lesson-plan' : 'gradebook-file') : undefined}
            registerTable={
              recordsTab === 'lessons' ? (
                <LessonPlanRegister schoolId={activeId} canEdit={canEdit} />
              ) : (
                <GradesPanel schoolId={activeId} canEdit={canEdit} />
              )
            }
          />
        }
      />
    </ModuleAccent>
  )
}

/** Each panel brings its own container — the ModuleTabs contract. */
function Panel({ children }) {
  return <div className="au-scope mx-auto max-w-page px-4 py-6 pb-16 sm:px-10 sm:py-8">{children}</div>
}
