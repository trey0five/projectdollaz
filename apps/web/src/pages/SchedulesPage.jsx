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
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, Landmark, Banknote, Target } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PageHeader } from '../components/ui/surface/index.js'
import '../styles/pending/b2-finance.css'
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

  const reduce = useReducedMotion()
  const tabRefs = useRef([])
  const onTabKey = (e, i) => {
    let next = null
    if (e.key === 'ArrowRight') next = (i + 1) % TABS.length
    else if (e.key === 'ArrowLeft') next = (i - 1 + TABS.length) % TABS.length
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = TABS.length - 1
    if (next == null) return
    e.preventDefault()
    setTab(TABS[next].id)
    tabRefs.current[next]?.focus()
  }

  return (
    <div className="min-h-screen">
      <BillingBanner />
      <main className="mx-auto max-w-page px-4 py-6 sm:px-10">
        <Link to="/reports" className="back-link mb-2">
          <ArrowLeft size={15} aria-hidden="true" /> All reports
        </Link>

        <PageHeader
          eyebrow={['Reports', activeSchool?.name, 'Supporting schedules'].filter(Boolean).join(' · ')}
          title="Supporting schedules"
          meta="Capital projects and cash & investment accounts that flow into your board packet. Pick a period, fill in the tables, and the next board report picks up the totals automatically."
          hue="37 99 235"
          actions={
            pickerPeriods.length > 0 ? (
              <div className="flex min-w-0 max-w-full flex-col gap-1">
                <span className="toolbar-label">Period</span>
                <PeriodSelector periods={pickerPeriods} activeId={periodId} onSelect={setPeriodId} light />
              </div>
            ) : null
          }
        />

        {pickerPeriods.length === 0 ? (
          <div className="b2-note mt-8">
            <p>No periods yet — import a trial balance to get started.</p>
          </div>
        ) : (
          <>
            <div className="scrollbar-none mb-6 mt-4 overflow-x-auto">
              <div role="tablist" aria-label="Schedules" className="tabs-ink min-w-max">
                {TABS.map((t, i) => {
                  const Icon = t.Icon
                  const active = tab === t.id
                  return (
                    <button
                      key={t.id}
                      ref={(el) => {
                        tabRefs.current[i] = el
                      }}
                      id={t.id === 'capital' ? 'schedules-capital-tab' : undefined}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      tabIndex={active ? 0 : -1}
                      onClick={() => setTab(t.id)}
                      onKeyDown={(e) => onTabKey(e, i)}
                      className="tab-ink shrink-0"
                    >
                      <span className="flex items-center gap-1.5 whitespace-nowrap">
                        <Icon size={14} aria-hidden="true" className="text-ink2" /> {t.label}
                      </span>
                      {active &&
                        (reduce ? (
                          <span className="tab-ink-rule" aria-hidden="true" />
                        ) : (
                          <motion.span layoutId="schedules-tab-rule" className="tab-ink-rule" aria-hidden="true" />
                        ))}
                    </button>
                  )
                })}
              </div>
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
