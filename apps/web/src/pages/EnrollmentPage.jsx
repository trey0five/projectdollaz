// ─────────────────────────────────────────────────────────────────────────────
// Enrollment route — Phase 2 Enrollment Intelligence. A LIGHT page: the vs-plan
// headline, the by-grade breakdown, and the SIS/roster connector (Blackbaud OAuth,
// key providers, and the universal OneRoster ZIP/CSV upload). School-scoped, keyed
// to the latest period for the vs-plan summary. Gated by the 'enrollment' module —
// a finance-only school direct-navving here gets a friendly "not on your plan"
// panel (the API 402 → isModuleNotLicensed). React 19 idioms: microtask-deferred
// fetch effects + a cancelled guard, loading/error/empty on every fetch.
//
// PREMIUM UI P4 (plan sketch 6): the dark hero is gone. The page opens with a
// light `PageHeader` (eyebrow ENROLLMENT · school · school year), then the
// hero's StatStrip + the by-grade Section, the source Section/Panel, the
// vs-plan Stats, and the analytics preview Stats — everything on the ground.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { RotateCcw, Building2, ArrowRight } from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import ModuleTabs, { ModuleAccent } from '../components/module/ModuleTabs.jsx'
import { AddDataCta, RecordsCta } from '../components/module/ModuleCtas.jsx'
import ModuleRegister from '../components/module/ModuleRegister.jsx'
import { moduleHue } from '../components/module/moduleAnatomy.js'
import BackLink from '../components/ui/BackLink.jsx'
import AddDataTab from '../components/wizard/AddDataTab.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { useUiV2 } from '../context/UiFlagContext.jsx'
import { useScope } from '../context/ScopeContext.jsx'
import { usePersistence } from '../context/PersistenceContext.jsx'
import {
  enrollmentApi,
  isModuleNotLicensed,
  isPaymentRequired,
  apiErrorMessage,
} from '../lib/api.js'
import VsPlanKpi from '../components/enrollment/VsPlanKpi.jsx'
import EnrollmentConnectCard from '../components/enrollment/EnrollmentConnectCard.jsx'
import EnrollmentHero, { fmtDay } from '../components/enrollment/EnrollmentHero.jsx'
import RosterSourceCard from '../components/enrollment/RosterSourceCard.jsx'
import EnrollmentAnalytics from '../components/enrollment/EnrollmentAnalytics.jsx'
import EnrollmentAnalyticsPreview from '../components/enrollment/EnrollmentAnalyticsPreview.jsx'
import StudentRegister from '../components/enrollment/StudentRegister.jsx'
import { PageHeader, Panel, Button } from '../components/ui/surface/index.js'

function GatePanel({ notLicensed }) {
  return (
    <div className="mx-auto max-w-page space-y-4 px-4 py-6 sm:px-10 sm:py-8">
      <BackLink />
      <Panel className="text-center">
        {notLicensed ? (
          <>
            <h2 className="font-serif text-title font-medium text-ink">Enrollment isn&apos;t on your plan yet</h2>
            <p className="mx-auto mt-2 max-w-md text-body text-ink2">
              Add the Enrollment module to connect your SIS, track headcount by grade, and see actual
              enrollment against your plan — including its tuition and cash impact in your briefing.
            </p>
          </>
        ) : (
          <>
            <h2 className="font-serif text-title font-medium text-ink">Your subscription is paused</h2>
            <p className="mx-auto mt-2 max-w-md text-body text-ink2">Resume your plan to manage enrollment.</p>
          </>
        )}
      </Panel>
    </div>
  )
}

function EnrollmentWorkspace() {
  const { activeId, activeSchool } = useSchools()
  const { periods } = usePersistence()
  const uiV2 = useUiV2()
  const { isMultiSchool } = useScope()
  const [searchParams, setSearchParams] = useSearchParams()
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'
  const periodId = periods && periods[0] ? periods[0].id : null
  const periodLabel = periods && periods[0] ? periods[0].label : null

  const [status, setStatus] = useState(null)
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notLicensed, setNotLicensed] = useState(false)
  const [notEntitled, setNotEntitled] = useState(false)
  const [reverting, setReverting] = useState(false)
  // How many students the REGISTER actually holds. Read here (not only inside the
  // KPI row) because the overview needs to compare it against the headcount: a
  // counted headcount over an empty register is the state the page must name.
  const [rosterCount, setRosterCount] = useState(null)
  // The full unfiltered aggregate — the hero's stat pips + Withdrawn read it.
  const [agg, setAgg] = useState(null)

  const load = useCallback(async () => {
    if (!activeId) return
    setLoading(true)
    setError('')
    try {
      const statusRes = await enrollmentApi.status(activeId)
      setStatus(statusRes.data ?? statusRes)
      setNotLicensed(false)
      setNotEntitled(false)
      // Summary rides the same gate; a missing period simply yields no summary.
      if (periodId) {
        try {
          const sumRes = await enrollmentApi.summary(activeId, periodId)
          setSummary(sumRes.data ?? sumRes)
        } catch {
          setSummary(null)
        }
        // The demographic read MOVED to the Analytics tab, which fetches it as
        // part of its one analytics call — the Overview no longer draws a mix.
      } else {
        setSummary(null)
      }
      try {
        const aggRes = await enrollmentApi.students.aggregate(activeId)
        setRosterCount((aggRes.data ?? aggRes)?.kpis?.enrolled ?? 0)
        // The hero rides the SAME read: kpis for the stat pips, counts.status for
        // Withdrawn (returned by the API since Phase 5, rendered nowhere until now).
        setAgg((aggRes.data ?? aggRes) ?? null)
      } catch {
        // A school without the register read simply gets no diagnosis, never an error.
        setRosterCount(null)
        setAgg(null)
      }
    } catch (e) {
      if (isModuleNotLicensed(e)) setNotLicensed(true)
      else if (isPaymentRequired(e)) setNotEntitled(true)
      else setError(apiErrorMessage(e, 'Could not load enrollment.'))
    } finally {
      setLoading(false)
    }
  }, [activeId, periodId])

  // Register "+ New" → the Add-data tab's students RecordFlow (?add deep link;
  // AddDataTab reads it on mount when the panel swaps in).
  const goAddStudents = useCallback(() => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', 'add')
    next.set('add', 'students')
    setSearchParams(next)
  }, [searchParams, setSearchParams])

  const doRevert = useCallback(async () => {
    if (!activeId || !periodId) return
    setReverting(true)
    try {
      await enrollmentApi.revertManual(activeId, { periodId })
      await load()
    } catch (e) {
      setError(apiErrorMessage(e, 'Could not restore the manual figure.'))
    } finally {
      setReverting(false)
    }
  }, [activeId, periodId, load])

  useEffect(() => {
    let cancelled = false
    // Microtask-deferred so we never setState synchronously inside the effect body.
    Promise.resolve().then(() => {
      if (!cancelled) load()
    })
    return () => {
      cancelled = true
    }
  }, [load])

  if (notLicensed || notEntitled) return <GatePanel notLicensed={notLicensed} />

  if (loading && !status) {
    return (
      <div className="mx-auto max-w-page px-4 py-10 sm:px-10">
        <div className="h-40 animate-pulse rounded-lg bg-ink/[.04]" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-page px-4 py-10 sm:px-10">
        <Panel tone="attention" className="text-center">
          <p className="text-body text-risk">{error}</p>
          <Button variant="secondary" onClick={load} className="mt-4">
            Try again
          </Button>
        </Panel>
      </div>
    )
  }

  // The page header (plan sketch 6): eyebrow MODULE · SCHOOL · SCHOOL YEAR, the
  // title in Garamond, a meta line that says where the headline came from, the
  // Records + Add-data entries on the hairline. ModuleAccent supplies the hue.
  const sourceWord =
    summary?.source === 'roster'
      ? 'Live from your roster'
      : summary?.provider
        ? `Synced from ${summary.provider}`
        : summary?.latest
          ? 'From your latest reading'
          : null
  const header = (
    <PageHeader
      eyebrow={['Enrollment', activeSchool?.name, periodLabel].filter(Boolean).join(' · ')}
      title="Enrollment"
      meta={
        [sourceWord, summary?.latest?.observedOn ? `as of ${fmtDay(summary.latest.observedOn) ?? summary.latest.observedOn}` : null].filter(Boolean).join(' · ') ||
        'Headcount, composition by grade, and actual enrollment against your plan.'
      }
      actions={
        <>
          <RecordsCta module="enrollment" />
          <AddDataCta />
        </>
      }
    />
  )

  const connectCard = (
    <EnrollmentConnectCard schoolId={activeId} canEdit={canEdit} status={status} onChanged={load} />
  )

  // Manual-supersede state (Decision C): summary.supersededManual is { value, fte, at }
  // (the backed-up hand-entered figure a diocesan import replaced), or null. Reversible
  // via revertManual.
  const supersededManual = summary?.supersededManual ?? null
  const isSuperseded = supersededManual != null
  const supersededValue = supersededManual?.value ?? null

  const supersedeBanner = isSuperseded ? (
    <Panel tone="attention" className="panel-watch">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-body font-semibold text-ink">Enrollment replaced by a diocesan import</p>
          <p className="mt-0.5 text-small text-ink2">
            An imported snapshot superseded the manually-entered figure
            {Number.isFinite(supersededValue) ? ` (was ${Number(supersededValue).toLocaleString('en-US')})` : ''}.
            The manual entry is kept as history — you can restore it.
          </p>
        </div>
        {canEdit && (
          <Button variant="secondary" onClick={doRevert} disabled={reverting} icon={<RotateCcw size={14} />} className="shrink-0">
            {reverting ? 'Restoring…' : 'Restore manual figure'}
          </Button>
        )}
      </div>
    </Panel>
  ) : null

  const diocesanLink =
    isMultiSchool && canEdit ? (
      <Button to="/enrollment/diocesan-import" variant="secondary" icon={<Building2 size={14} />} className="self-start">
        Import all schools from one diocesan file <ArrowRight size={13} aria-hidden="true" />
      </Button>
    ) : null

  // Phase 5 — the school's OWN roster is the system of record when no SIS is
  // connected. In roster mode the mix cards give way to the richer, filterable
  // RosterAnalyticsSection (aggregate-only); SIS/snapshot schools keep the
  // existing cards byte-identical.
  const rosterMode = status?.rosterMode === 'roster'

  const goAddData = () => {
    const next = new URLSearchParams(searchParams)
    next.set('tab', 'add')
    setSearchParams(next, { replace: false })
  }

  // The hero: ring + dome + pips. It ABSORBED the old 4-card KPI row — same
  // four figures, same honesty rules (no roster ⇒ em-dash + why, never a zero
  // we didn't count), one surface instead of two.
  const enrollmentHero = (
    <EnrollmentHero
      total={summary?.latest?.totalEnrolled ?? null}
      byGrade={summary?.latest?.byGrade ?? null}
      asOf={summary?.latest?.observedOn ?? null}
      source={summary?.source ?? null}
      provider={summary?.provider ?? null}
      vsPlan={summary?.vsPlan ?? null}
      kpis={rosterMode ? (agg?.kpis ?? null) : null}
      withdrawn={rosterMode ? (agg?.counts?.status?.withdrawn ?? null) : null}
      onGradeClick={(grade) => {
        const next = new URLSearchParams(searchParams)
        next.set('tab', 'records')
        next.set('grade', grade)
        setSearchParams(next, { replace: false })
      }}
    />
  )

  // Where the numbers came from + the counted-but-empty diagnosis. Rendered high
  // on the overview: it is the answer to "I added a roster and nothing happened",
  // and it was previously nowhere on the page.
  const rosterSource = (
    <RosterSourceCard
      schoolId={activeId}
      canEdit={canEdit}
      headcount={summary?.latest?.totalEnrolled ?? null}
      rosterCount={rosterCount}
      onAddData={goAddData}
    />
  )

  // ── THE MOVE ────────────────────────────────────────────────────────────────
  // The Overview used to carry the headcount trend AND the whole mix block
  // (RosterAnalyticsSection in roster mode, DemographicMixCard otherwise). Both
  // now live on the Analytics tab, which is a whole dashboard built for them.
  //
  // The Overview keeps the question it is actually good at: IS MY DATA FLOWING,
  // AND WHAT IS THE HEADLINE — the source card, the vs-plan KPI, the attention
  // banner. Moved, not duplicated: there is no second copy of any of it here, or
  // the two would drift and a reader would have to pick.
  //
  // The forwarding address grew up: the one-line text pointer read as a footnote
  // and hid a whole dashboard, so it is now a strip of LIVE preview tiles — a
  // real sparkline, the vs-plan headline, the cohort pulse — each deep-linking
  // to its analytics view. Same payload as the tab (same hook), so the preview
  // and the destination cannot disagree; if the read fails, the strip degrades
  // back to the plain pointer rather than vanishing.
  const analysisPointer = <EnrollmentAnalyticsPreview schoolId={activeId} periodId={periodId} />

  // Shared overview extras (both the v2 tab and the flat page render these).
  const mixSection = (
    <>
      {supersedeBanner ? <div className="mt-6">{supersedeBanner}</div> : null}
      {analysisPointer}
      {diocesanLink ? <div className="mt-6">{diocesanLink}</div> : null}
    </>
  )

  // v2: the connect card is the "Add data" surface (ENG-C2's AddDataTab wraps it),
  // so the Overview shows only the vs-plan summary + by-grade breakdown.
  if (uiV2) {
    return (
      // B0 — THE UNLOCK. /enrollment was the ONLY module page rendering
      // <ModuleTabs> bare: every other page wraps <ModuleAccent>, which re-hues
      // --c-module/--c-glow/--grad-cta-* to the module colour. Without it,
      // kpi-3d, btn-cta and card-flashy all rendered default gold/blue here
      // while three components hand-painted sky on top.
      <ModuleAccent moduleKey="enrollment">
      <ModuleTabs
          moduleKey="enrollment"
          overview={
            <div className="mx-auto max-w-page px-4 pb-12 sm:px-10">
              {header}
              <div className="mt-2">
                {enrollmentHero}
                {rosterSource}
                {/* The vs-plan detail earns its space only when a plan EXISTS —
                    with none, it repeated the hero's no-plan line. The hero
                    carries the door. */}
                {summary?.vsPlan ? <VsPlanKpi summary={summary} /> : null}
                {mixSection}
              </div>
            </div>
          }
          addData={
            <AddDataTab module="enrollment" schoolId={activeId} canEdit={canEdit} onDone={load} />
          }
          // The analysis that used to crowd the Overview, given the room it
          // needed: hero tiles, the bento of charts, what the gap costs, every
          // grade in figures, and what the data cannot honestly show yet.
          analytics={
            <EnrollmentAnalytics
              schoolId={activeId}
              periodId={periodId}
              rosterMode={rosterMode}
              onGoToAddData={goAddData}
            />
          }
          records={
            <ModuleRegister
              moduleKey="enrollment"
              hue={moduleHue('enrollment')}
              tabs={[{ key: 'students', label: 'Student roster' }]}
              activeTab="students"
              onNew={canEdit ? goAddStudents : undefined}
              registerTable={
                <StudentRegister
                  schoolId={activeId}
                  canEdit={canEdit}
                  hue={moduleHue('enrollment')}
                  onChanged={load}
                  // A hero ring segment deep-links here filtered to its grade.
                  initialGrade={searchParams.get('grade')}
                />
              }
            />
          }
        />
      </ModuleAccent>
    )
  }

  return (
    <div className="mx-auto max-w-page px-4 pb-12 sm:px-10">
      {header}

      <div className="mt-2">
        {enrollmentHero}

        {rosterSource}

        {summary?.vsPlan ? <VsPlanKpi summary={summary} /> : null}

        {mixSection}

        <div className="mt-8">{connectCard}</div>
      </div>
    </div>
  )
}

export default function EnrollmentPage() {
  return (
    <div className="min-h-screen">
      <BillingBanner />
      <EnrollmentWorkspace />
    </div>
  )
}
