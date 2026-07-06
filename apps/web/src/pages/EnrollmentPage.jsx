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
import { motion } from 'framer-motion'
import { GraduationCap } from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
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

function GatePanel({ notLicensed }) {
  return (
    <div className="mx-auto max-w-[1180px] px-4 py-6 sm:px-10 sm:py-8">
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
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'
  const periodId = periods && periods[0] ? periods[0].id : null

  const [status, setStatus] = useState(null)
  const [summary, setSummary] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notLicensed, setNotLicensed] = useState(false)
  const [notEntitled, setNotEntitled] = useState(false)

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
      } else {
        setSummary(null)
      }
    } catch (e) {
      if (isModuleNotLicensed(e)) setNotLicensed(true)
      else if (isPaymentRequired(e)) setNotEntitled(true)
      else setError(apiErrorMessage(e, 'Could not load enrollment.'))
    } finally {
      setLoading(false)
    }
  }, [activeId, periodId])

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
      <div className="mx-auto max-w-[1180px] px-4 py-10 sm:px-10">
        <div className="h-40 animate-pulse rounded-2xl border-2 border-rule/40 bg-white/60" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-[1180px] px-4 py-10 sm:px-10">
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

  return (
    <div className="mx-auto max-w-[1180px] px-4 py-8 sm:px-10">
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

      <div className="space-y-6">
        <VsPlanKpi summary={summary} />

        {summary?.latest?.byGrade && <ByGradeChart byGrade={summary.latest.byGrade} />}

        <EnrollmentConnectCard
          schoolId={activeId}
          canEdit={canEdit}
          status={status}
          onChanged={load}
        />
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
