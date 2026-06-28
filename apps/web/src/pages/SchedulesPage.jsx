// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 — Supporting Schedules surface (route /reports/schedules), OFF the
// 5-step Board Report wizard. Two editable-table workspaces (Capital Budget /
// Cash & Investments) that the user maintains per period; saving here feeds the
// next board-report assemble()'s capitalBudget / cashInvestments sections.
//
// Period selection mirrors ReportsPage: a snapshot-period picker seeded from the
// ?period= query param (carried from the hub) or the newest snapshot period.
// Each workspace is key-remounted per period (`${schoolId}:${periodId}`) so the
// ForecastWorkspace-style seed-on-key always re-runs cleanly.
//
// React-Compiler safety: tab + period selection are read at render, set only from
// handlers; the period sync is the established microtask-deferred sync-on-key.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Landmark, Banknote, Target } from 'lucide-react'
import { Link } from 'react-router-dom'
import TopBar from '../components/TopBar.jsx'
import BillingBanner from '../components/BillingBanner.jsx'
import PeriodSelector from '../components/analytics/PeriodSelector.jsx'
import CapitalScheduleWorkspace from '../components/reports/schedules/CapitalScheduleWorkspace.jsx'
import CashScheduleWorkspace from '../components/reports/schedules/CashScheduleWorkspace.jsx'
import CampaignScheduleWorkspace from '../components/reports/schedules/CampaignScheduleWorkspace.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { usePersistence } from '../context/PersistenceContext.jsx'

const TABS = [
  { id: 'capital', label: 'Capital Budget', Icon: Landmark },
  { id: 'cash', label: 'Cash & Investments', Icon: Banknote },
  { id: 'campaign', label: 'Capital Campaign', Icon: Target },
]

export default function SchedulesPage() {
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'

  const { periods } = usePersistence()
  const [searchParams] = useSearchParams()
  const queryPeriod = searchParams.get('period')

  // Snapshot periods (newest-first); the picker shows these like the Reports hub.
  const pickerPeriods = useMemo(() => {
    const list = periods || []
    const withSnapshot = list.filter((p) => p.hasSnapshot)
    return withSnapshot.length ? withSnapshot : list
  }, [periods])
  const defaultPeriodId =
    (queryPeriod && pickerPeriods.some((p) => p.id === queryPeriod) ? queryPeriod : null) ??
    pickerPeriods[0]?.id ??
    null

  const [periodId, setPeriodId] = useState(defaultPeriodId)
  // Keep the selection valid as periods hydrate (microtask-deferred sync-on-key).
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      const list = pickerPeriods
      if (list.length === 0) {
        setPeriodId((cur) => (cur === null ? cur : null))
      } else {
        setPeriodId((cur) => (list.some((p) => p.id === cur) ? cur : list[0].id))
      }
    })
    return () => {
      cancelled = true
    }
  }, [pickerPeriods])

  const [tab, setTab] = useState('capital')

  return (
    <div className="min-h-screen bg-section">
      <TopBar />
      <BillingBanner />
      <main className="mx-auto max-w-[1100px] px-4 py-8 sm:px-8">
        <Link
          to="/reports"
          className="mb-5 inline-flex items-center gap-1.5 text-[15px] font-semibold text-muted transition-colors hover:text-gold"
        >
          <ArrowLeft size={15} /> All reports
        </Link>

        <motion.header initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-gold">Reports</p>
          <h1 className="mt-1 font-serif text-3xl font-semibold text-navy">Supporting schedules</h1>
          <p className="mt-1.5 max-w-2xl text-[16px] text-muted">
            Capital projects and cash &amp; investment accounts that flow into your board packet. Pick a
            period, fill in the tables, and the next board report picks up the totals automatically.
          </p>
        </motion.header>

        {pickerPeriods.length === 0 ? (
          <div className="card-soft px-6 py-12 text-center">
            <p className="font-serif text-base italic text-muted">
              No periods yet — import a trial balance to get started.
            </p>
          </div>
        ) : (
          <>
            <div className="mb-5">
              <p className="mb-2 text-[13px] font-semibold uppercase tracking-[0.08em] text-muted">
                Period
              </p>
              <PeriodSelector
                periods={pickerPeriods}
                activeId={periodId}
                onSelect={setPeriodId}
                light
              />
            </div>

            <div className="mb-6 flex flex-wrap gap-2">
              {TABS.map((t) => {
                const Icon = t.Icon
                const active = tab === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-[15px] font-semibold transition-all ${
                      active
                        ? 'border-gold/60 bg-gold/10 text-navy shadow-card'
                        : 'border-rule/60 text-muted hover:border-gold/50 hover:text-navy'
                    }`}
                  >
                    <Icon size={16} /> {t.label}
                  </button>
                )
              })}
            </div>

            {tab === 'capital' && (
              <CapitalScheduleWorkspace
                key={`cap:${schoolId}:${periodId}`}
                schoolId={schoolId}
                periodId={periodId}
                canEdit={canEdit}
              />
            )}
            {tab === 'cash' && (
              <CashScheduleWorkspace
                key={`cash:${schoolId}:${periodId}`}
                schoolId={schoolId}
                periodId={periodId}
                canEdit={canEdit}
              />
            )}
            {tab === 'campaign' && (
              <CampaignScheduleWorkspace
                key={`camp:${schoolId}:${periodId}`}
                schoolId={schoolId}
                periodId={periodId}
                canEdit={canEdit}
              />
            )}
          </>
        )}
      </main>
    </div>
  )
}
