// ─────────────────────────────────────────────────────────────────────────────
// Enrollment route — Phase 2 Enrollment Intelligence. A LIGHT page: the vs-plan
// headline, the by-grade breakdown, and the SIS/roster connector (Blackbaud OAuth,
// key providers, and the universal OneRoster ZIP/CSV upload). School-scoped, keyed
// to the latest period for the vs-plan summary. Gated by the 'enrollment' module —
// a finance-only school direct-navving here gets a friendly "not on your plan"
// panel (the API 402 → isModuleNotLicensed). React 19 idioms: microtask-deferred
// fetch effects + a cancelled guard, loading/error/empty on every fetch.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { GraduationCap, RotateCcw, Building2, ArrowRight } from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import ModuleTabs from '../components/module/ModuleTabs.jsx'
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
import ByGradeChart from '../components/enrollment/ByGradeChart.jsx'
import EnrollmentConnectCard from '../components/enrollment/EnrollmentConnectCard.jsx'
import DemographicMixCard from '../components/analytics/v2/DemographicMixCard.jsx'
import GradeMixCard from '../components/analytics/v2/GradeMixCard.jsx'

function GatePanel({ notLicensed }) {
  return (
    <div className="mx-auto max-w-page space-y-4 px-4 py-6 sm:px-10 sm:py-8">
      <BackLink />
      <div className="card-soft flex flex-col items-center gap-3 px-6 py-14 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-gradient text-navy shadow-glow">
          <GraduationCap size={26} />
        </span>
        {notLicensed ? (
          <>
            <h2 className="font-serif text-xl font-semibold text-navy">
              Enrollment isn&apos;t on your plan yet
            </h2>
            <p className="max-w-md text-[15px] text-muted">
              Add the Enrollment module to connect your SIS, track headcount by grade, and see actual
              enrollment against your plan — including its tuition and cash impact in your briefing.
            </p>
          </>
        ) : (
          <>
            <h2 className="font-serif text-xl font-semibold text-navy">Your subscription is paused</h2>
            <p className="max-w-md text-[15px] text-muted">
              Resume your plan to manage enrollment.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

function EnrollmentWorkspace() {
  const { activeId, activeSchool } = useSchools()
  const { periods } = usePersistence()
  const uiV2 = useUiV2()
  const { isMultiSchool } = useScope()
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'
  const periodId = periods && periods[0] ? periods[0].id : null

  const [status, setStatus] = useState(null)
  const [summary, setSummary] = useState(null)
  const [demographics, setDemographics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notLicensed, setNotLicensed] = useState(false)
  const [notEntitled, setNotEntitled] = useState(false)
  const [reverting, setReverting] = useState(false)

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
        // Demographic / grade-mix read surface (aggregate; same 'enrollment' gate).
        try {
          const demRes = await enrollmentApi.getDemographics(activeId, periodId)
          setDemographics(demRes.data ?? demRes)
        } catch {
          setDemographics(null)
        }
      } else {
        setSummary(null)
        setDemographics(null)
      }
    } catch (e) {
      if (isModuleNotLicensed(e)) setNotLicensed(true)
      else if (isPaymentRequired(e)) setNotEntitled(true)
      else setError(apiErrorMessage(e, 'Could not load enrollment.'))
    } finally {
      setLoading(false)
    }
  }, [activeId, periodId])

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
        <div className="h-40 animate-pulse rounded-2xl border-2 border-rule/40 bg-white/60" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-page px-4 py-10 sm:px-10">
        <div className="rounded-2xl border border-danger/30 bg-danger/[0.06] px-6 py-10 text-center">
          <p className="text-[15px] text-danger">{error}</p>
          <button
            onClick={load}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-gold/60 bg-gold/10 px-4 py-2 text-[15px] font-semibold text-navy transition-all hover:bg-gold/20"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  const header = (
    <motion.header
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-6 flex items-center gap-3"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-gradient text-navy shadow-glow">
        <GraduationCap size={24} />
      </span>
      <div>
        <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-muted">
          Domain · Enrollment intelligence
        </p>
        <h1 className="font-serif text-2xl font-bold text-navy sm:text-3xl">Enrollment</h1>
      </div>
    </motion.header>
  )

  const connectCard = (
    <EnrollmentConnectCard schoolId={activeId} canEdit={canEdit} status={status} onChanged={load} />
  )

  // ── Granular reads (unwrap the demographics contract) ────────────────────────
  // GET …/enrollment/demographics returns each dimension as { counts, shares }
  // (race also carries diversityIndex) and gradeMix as { counts, shares }. The mix
  // cards want FLAT count maps, so unwrap `.counts` (tolerating a flat shape too).
  const demSrc = demographics || {}
  const gender = demSrc.gender?.counts ?? demSrc.gender ?? null
  const ethnicity = demSrc.ethnicity?.counts ?? demSrc.ethnicity ?? null
  const race = demSrc.race?.counts ?? demSrc.race ?? null
  const byDemographics = gender || ethnicity || race ? { gender, ethnicity, race } : null
  const mixByGrade = demSrc.gradeMix?.counts ?? summary?.latest?.byGrade ?? null
  const dvIndex = demSrc.race?.diversityIndex ?? demSrc.diversityIndex

  // Manual-supersede state (Decision C): summary.supersededManual is { value, fte, at }
  // (the backed-up hand-entered figure a diocesan import replaced), or null. Reversible
  // via revertManual.
  const supersededManual = summary?.supersededManual ?? null
  const isSuperseded = supersededManual != null
  const supersededValue = supersededManual?.value ?? null

  const supersedeBanner = isSuperseded ? (
    <div className="flex flex-col gap-3 rounded-2xl border border-gold/40 bg-gold/[0.07] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2.5">
        <Building2 size={18} className="mt-0.5 shrink-0 text-amber-700" />
        <div>
          <p className="text-[15px] font-semibold text-navy">Enrollment replaced by a diocesan import</p>
          <p className="text-[13.5px] text-muted">
            An imported snapshot superseded the manually-entered figure
            {Number.isFinite(supersededValue) ? ` (was ${Number(supersededValue).toLocaleString('en-US')})` : ''}.
            The manual entry is kept as history — you can restore it.
          </p>
        </div>
      </div>
      {canEdit && (
        <button
          type="button"
          onClick={doRevert}
          disabled={reverting}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-gold/60 bg-white px-3.5 py-2 text-[14px] font-semibold text-navy transition-all hover:bg-gold/10 disabled:opacity-50"
        >
          <RotateCcw size={15} /> {reverting ? 'Restoring…' : 'Restore manual figure'}
        </button>
      )}
    </div>
  ) : null

  const diocesanLink =
    isMultiSchool && canEdit ? (
      <Link
        to="/enrollment/diocesan-import"
        className="group inline-flex items-center gap-1.5 self-start rounded-lg border border-gold/40 bg-white px-3.5 py-2 text-[14px] font-semibold text-navy transition-all hover:bg-gold/10"
      >
        <Building2 size={15} className="text-gold" /> Import all schools from one diocesan file
        <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
      </Link>
    ) : null

  // Shared overview extras (both the v2 tab and the flat page render these).
  const mixSection = (
    <>
      {supersedeBanner}
      {byDemographics && <DemographicMixCard byDemographics={byDemographics} diversityIndex={dvIndex} />}
      {mixByGrade && <GradeMixCard byGrade={mixByGrade} />}
      {diocesanLink}
    </>
  )

  // v2: the connect card is the "Add data" surface (ENG-C2's AddDataTab wraps it),
  // so the Overview shows only the vs-plan summary + by-grade breakdown.
  if (uiV2) {
    return (
      <ModuleTabs
        moduleKey="enrollment"
        overview={
          <div className="mx-auto max-w-page px-4 py-8 sm:px-10">
            {header}
            <div className="space-y-6">
              <VsPlanKpi summary={summary} />
              {summary?.latest?.byGrade && <ByGradeChart byGrade={summary.latest.byGrade} />}
              {mixSection}
            </div>
          </div>
        }
        addData={
          <AddDataTab module="enrollment" schoolId={activeId} canEdit={canEdit} onDone={load} />
        }
      />
    )
  }

  return (
    <div className="mx-auto max-w-page px-4 py-8 sm:px-10">
      {header}

      <div className="space-y-6">
        <VsPlanKpi summary={summary} />

        {summary?.latest?.byGrade && <ByGradeChart byGrade={summary.latest.byGrade} />}

        {mixSection}

        {connectCard}
      </div>
    </div>
  )
}

export default function EnrollmentPage() {
  return (
    <div className="min-h-screen bg-section">
      <BillingBanner />
      <EnrollmentWorkspace />
    </div>
  )
}
