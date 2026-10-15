// ─────────────────────────────────────────────────────────────────────────────
// Enrollment route — Phase 2 Enrollment Intelligence. A LIGHT page: the vs-plan
// headline, the by-grade breakdown, and the SIS/roster connector (Blackbaud OAuth,
// key providers, and the universal OneRoster ZIP/CSV upload). School-scoped, keyed
// to the latest period for the vs-plan summary. Gated by the 'enrollment' module —
// a finance-only school direct-navving here gets a friendly "not on your plan"
// panel (the API 402 → isModuleNotLicensed). React 19 idioms: microtask-deferred
// fetch effects + a cancelled guard, loading/error/empty on every fetch.
//
// AURORA (owner-approved 2026-10-15): the page opens with the enrollment band
// (school chip · period, "Enrollment", one plain verdict sentence, Add data /
// Records / Analytics, the grade ring and up to four glass figures), then
// "Needs a look" tiles (the counted-but-empty roster, a superseded manual
// figure), "Students by grade", "Look deeper" analytics tiles, where the
// numbers came from, and How this works.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, RotateCcw, Building2, BarChart3, CloudUpload, History, Wrench } from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import ModuleTabs, { ModuleAccent } from '../components/module/ModuleTabs.jsx'
import { AddDataCta, RecordsCta } from '../components/module/ModuleCtas.jsx'
import ModuleRegister from '../components/module/ModuleRegister.jsx'
import { moduleHue } from '../components/module/moduleAnatomy.js'
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
import RosterSourceCard, { RosterDiagnosisTile } from '../components/enrollment/RosterSourceCard.jsx'
import EnrollmentAnalytics from '../components/enrollment/EnrollmentAnalytics.jsx'
import EnrollmentAnalyticsPreview from '../components/enrollment/EnrollmentAnalyticsPreview.jsx'
import StudentRegister from '../components/enrollment/StudentRegister.jsx'
import { DomainStatePanel } from '../components/domain/DomainCommandCenter.jsx'
import {
  AuroraButton,
  AuroraLightButton,
  AuroraSection,
  AuroraTile,
  AuroraTileGrid,
  HowThisWorks,
  fyLabel,
} from '../components/ui/aurora/index.js'

// Entitlement / billing gate — the band, one line, one button.
function GatePanel({ notLicensed }) {
  return notLicensed ? (
    <DomainStatePanel
      moduleKey="enrollment"
      title="Enrollment"
      showBack
      verdict="Enrollment isn't on your plan yet."
      icon={Building2}
      text="Add the Enrollment module to track headcount by grade and against your plan."
      action={
        <AuroraLightButton variant="ghost" to="/settings/billing">
          See plans
        </AuroraLightButton>
      }
    />
  ) : (
    <DomainStatePanel
      moduleKey="enrollment"
      title="Enrollment"
      showBack
      verdict="Your subscription is paused."
      icon={Building2}
      text="Resume your plan to manage enrollment."
      action={
        <AuroraLightButton variant="ghost" to="/settings/billing">
          Resume plan
        </AuroraLightButton>
      }
    />
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
      <DomainStatePanel
        moduleKey="enrollment"
        title="Enrollment"
        verdict="Loading your enrollment…"
        icon={Building2}
        text="Fetching the latest headcount."
        busy
      />
    )
  }

  if (error) {
    return (
      <DomainStatePanel
        moduleKey="enrollment"
        title="Enrollment"
        verdict="We couldn't load enrollment just now."
        icon={Wrench}
        text={error}
        action={
          <AuroraLightButton variant="ghost" onClick={load}>
            Try again
          </AuroraLightButton>
        }
      />
    )
  }

  // Where the headline came from — for How this works (the band names the
  // source on the grade strip's pill).
  const sourceWord =
    summary?.source === 'roster'
      ? 'Live from your roster'
      : summary?.provider
        ? `Synced from ${summary.provider}`
        : summary?.latest
          ? 'From your latest reading'
          : null
  const asOfDay = summary?.latest?.observedOn ? (fmtDay(summary.latest.observedOn) ?? summary.latest.observedOn) : null
  const eyebrow = [periodLabel ? fyLabel(periodLabel) : null, asOfDay ? `as of ${asOfDay}` : null].filter(Boolean).join(' · ') || null

  const connectCard = (
    <EnrollmentConnectCard schoolId={activeId} canEdit={canEdit} status={status} onChanged={load} />
  )

  // Manual-supersede state (Decision C): summary.supersededManual is { value, fte, at }
  // (the backed-up hand-entered figure a diocesan import replaced), or null. Reversible
  // via revertManual.
  const supersededManual = summary?.supersededManual ?? null
  const isSuperseded = supersededManual != null
  const supersededValue = supersededManual?.value ?? null

  const supersedeTile = isSuperseded ? (
    <AuroraTile
      key="sup"
      icon={History}
      hue="var(--au-h2)"
      title="A diocesan import replaced your number"
      desc={`The figure you typed${
        Number.isFinite(supersededValue) ? ` (${Number(supersededValue).toLocaleString('en-US')})` : ''
      } is kept as history. You can bring it back.`}
      foot={
        canEdit ? (
          <AuroraLightButton variant="ghost" size="sm" onClick={doRevert} disabled={reverting} icon={<RotateCcw size={14} aria-hidden="true" />}>
            {reverting ? 'Restoring…' : 'Restore manual figure'}
          </AuroraLightButton>
        ) : null
      }
    />
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

  // THE STATE THAT HAD NO WORDS: a counted headcount over an empty register.
  // The same rule RosterSourceCard keeps; the page renders it as a tile in
  // "Needs a look", right under the band.
  const countedButEmpty = (summary?.latest?.totalEnrolled ?? 0) > 0 && rosterCount === 0
  const lookTiles = [
    countedButEmpty ? (
      <RosterDiagnosisTile
        key="diag"
        headcount={summary.latest.totalEnrolled}
        canEdit={canEdit}
        onAddData={goAddData}
      />
    ) : null,
    supersedeTile,
  ].filter(Boolean)
  const attention = lookTiles.length ? (
    <AuroraSection
      first
      icon={Wrench}
      tone="watch"
      title="Needs a look"
      subtitle={lookTiles.length === 1 ? 'One thing here needs you' : 'Two things here need you'}
      count={`${lookTiles.length} to check`}
    >
      <AuroraTileGrid cols={2}>{lookTiles}</AuroraTileGrid>
    </AuroraSection>
  ) : null

  // The diocesan door — a secondary job, so it is a small text link after the
  // band's buttons, not a fourth equal-weight outline button on its own line.
  const diocesanLink =
    isMultiSchool && canEdit ? (
      <Link to="/enrollment/diocesan-import" className="enr-band-link">
        <Building2 size={15} aria-hidden="true" />
        Import all schools
        <ArrowRight size={14} aria-hidden="true" />
      </Link>
    ) : null

  // The band + "Needs a look" + "Students by grade". The hero ABSORBED the old
  // KPI row — same figures, same honesty rules (no roster ⇒ em-dash + why,
  // never a zero we didn't count).
  const heroFor = (planTile) => (
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
      school={activeSchool?.name ?? null}
      eyebrow={eyebrow}
      actions={
        <>
          {uiV2 ? <AddDataCta /> : null}
          {uiV2 ? <RecordsCta module="enrollment" /> : null}
          {uiV2 ? (
            <AuroraButton to="?tab=analytics" icon={<BarChart3 size={18} aria-hidden="true" />}>
              Analytics
            </AuroraButton>
          ) : null}
          {diocesanLink}
        </>
      }
      attention={attention}
      // The vs-plan tile earns its space only when a plan EXISTS — with none,
      // it repeated the band's no-plan line. The band carries the door.
      planTile={planTile}
      emptyAction={
        canEdit ? (
          <AuroraLightButton variant="ghost" onClick={goAddData} icon={<CloudUpload size={15} aria-hidden="true" />}>
            Add enrollment
          </AuroraLightButton>
        ) : null
      }
    />
  )

  // Where the numbers came from: the import receipts, grouped by school year
  // and collapsed. The counted-but-empty diagnosis is the tile above, so the
  // card renders the receipts only.
  const rosterSource = (
    <RosterSourceCard
      schoolId={activeId}
      canEdit={canEdit}
      headcount={summary?.latest?.totalEnrolled ?? null}
      rosterCount={rosterCount}
      onAddData={goAddData}
      diagnosis={false}
    />
  )

  // ── THE MOVE ────────────────────────────────────────────────────────────────
  // The headcount trend and the whole mix block live on the Analytics tab, a
  // whole dashboard built for them. The Overview keeps the question it is good
  // at: IS MY DATA FLOWING, AND WHAT IS THE HEADLINE. The door into Analytics is
  // a strip of LIVE preview tiles — a real sparkline, the vs-plan headline, the
  // cohort pulse — each deep-linking to its view. Same payload as the tab (same
  // hook), so the preview and the destination cannot disagree.
  const analysisPointer = <EnrollmentAnalyticsPreview schoolId={activeId} periodId={periodId} />

  const howItWorks = (
    <HowThisWorks>
      <p>
        {sourceWord ? `${sourceWord}${asOfDay ? `, as of ${asOfDay}` : ''}. ` : ''}The headcount is the whole
        school; the student list (Records) holds one row per student.
      </p>
      <p>
        The plan comes from your budget or enrollment plan. On plan means within 2% of it; Watch is 2–5% short;
        At risk is more than 5% short.
      </p>
      <p>
        A grade with fewer than 5 students shows as “&lt;5” and draws no column, so no child can be identified.
      </p>
    </HowThisWorks>
  )

  const overviewFor = (planTile) => (
    <div className="au-scope mx-auto max-w-page px-4 py-6 pb-16 sm:px-10 sm:py-8">
      {heroFor(planTile)}
      {analysisPointer}
      {rosterSource}
      {!uiV2 ? <div className="mt-8">{connectCard}</div> : null}
      {howItWorks}
    </div>
  )

  // v2: the connect card is the "Add data" surface (ENG-C2's AddDataTab wraps it),
  // so the Overview shows only the vs-plan summary + by-grade breakdown.
  if (uiV2) {
    return (
      // B0 — THE UNLOCK. /enrollment was the ONLY module page rendering
      // <ModuleTabs> bare: every other page wraps <ModuleAccent>, which re-hues
      // the accent vars (and the Aurora band palette) to the module colour.
      <ModuleAccent moduleKey="enrollment">
      <ModuleTabs
          moduleKey="enrollment"
          overview={overviewFor(summary?.vsPlan ? <VsPlanKpi summary={summary} /> : null)}
          addData={
            <AddDataTab module="enrollment" schoolId={activeId} canEdit={canEdit} onDone={load} />
          }
          // The analysis that used to crowd the Overview, given the room it
          // needed: the band, the four doors, what the gap costs, every grade
          // in figures, and what the data cannot honestly show yet.
          analytics={
            <EnrollmentAnalytics
              schoolId={activeId}
              periodId={periodId}
              rosterMode={rosterMode}
              onGoToAddData={goAddData}
              schoolName={activeSchool?.name ?? null}
              periodLabel={periodLabel}
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
                  // A grade row on the overview deep-links here filtered to its grade.
                  initialGrade={searchParams.get('grade')}
                />
              }
            />
          }
        />
      </ModuleAccent>
    )
  }

  return <ModuleAccent moduleKey="enrollment">{overviewFor(summary?.vsPlan ? <VsPlanKpi summary={summary} /> : null)}</ModuleAccent>
}

export default function EnrollmentPage() {
  return (
    <div className="min-h-screen">
      <BillingBanner />
      <EnrollmentWorkspace />
    </div>
  )
}
