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
import { Landmark, Banknote, Target, FileBarChart2, ClipboardList, CloudUpload, Plus } from 'lucide-react'
import '../styles/pending/b2-finance.css'
import BillingBanner from '../components/BillingBanner.jsx'
import {
  AuroraButton,
  AuroraEmpty,
  AuroraLightButton,
  AuroraSection,
  HowThisWorks,
  VerdictEm,
} from '../components/ui/aurora/index.js'
import {
  FinanceSubPage,
  FinanceSubBand,
  FinanceMore,
  FinancePeriodSwitch,
  yearName,
} from '../components/statements/financeSub.jsx'
import { periodClosed } from '../components/finance/financeAurora.js'
import { formatShortDate } from '../lib/format.js'
import { useUiV2 } from '../context/UiFlagContext.jsx'
import { addDataHref } from '../lib/dataDestinations.js'
import CapitalScheduleWorkspace from '../components/reports/schedules/CapitalScheduleWorkspace.jsx'
import CashScheduleWorkspace from '../components/reports/schedules/CashScheduleWorkspace.jsx'
import CampaignScheduleWorkspace from '../components/reports/schedules/CampaignScheduleWorkspace.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { usePersistence } from '../context/PersistenceContext.jsx'

// `add` — the band's primary button for that schedule: the workspace's own
// default "add" (the button marked data-add-default), clicked for the reader.
const TABS = [
  { id: 'capital', label: 'Capital Budget', Icon: Landmark, add: 'Add project' },
  { id: 'cash', label: 'Cash & Investments', Icon: Banknote, add: 'Add account' },
  { id: 'campaign', label: 'Capital Campaign', Icon: Target, add: 'Add division' },
]

const CRUMBS = [
  { label: 'Dashboard', to: '/app' },
  { label: 'Finance', to: '/finance' },
  { label: 'Reports', to: '/reports' },
  { label: 'Supporting Schedules' },
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
  const uiV2 = useUiV2()
  const reduce = useReducedMotion()
  const period = pickerPeriods.find((p) => p.id === periodId) ?? null
  const periodName = period ? yearName(period.label) : null
  const activeTab = TABS.find((t) => t.id === tab) ?? TABS[0]

  // The band's main job: run the open schedule's own default "add" (the same
  // button the table carries), then bring that table into view.
  const editorRef = useRef(null)
  const addFromBand = () => {
    const btn = editorRef.current?.querySelector('[data-add-default="true"]')
    if (!btn) return
    btn.click()
    btn.closest('section')?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

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
      <main>
        <FinanceSubPage crumbs={CRUMBS}>
          <FinanceSubBand
            eyebrow={
              period?.periodEndDate
                ? `${periodClosed(period.periodEndDate) ? 'Year ended' : 'Year ends'} ${formatShortDate(period.periodEndDate)}`
                : null
            }
            title="Supporting Schedules"
            verdict={
              periodName ? (
                <>
                  Capital projects, cash and investments for <VerdictEm>{periodName}</VerdictEm>. They flow into your next
                  board report.
                </>
              ) : (
                <>Add a year&rsquo;s numbers first, then fill in the schedules here.</>
              )
            }
            actions={
              <>
                {canEdit && periodId ? (
                  <AuroraButton variant="primary" onClick={addFromBand} icon={<Plus size={19} aria-hidden="true" />}>
                    {activeTab.add}
                  </AuroraButton>
                ) : null}
                <AuroraButton to="/reports" icon={<FileBarChart2 size={19} aria-hidden="true" />}>
                  All reports
                </AuroraButton>
              </>
            }
            aside={<FinancePeriodSwitch periods={pickerPeriods} activeId={periodId} onSelect={setPeriodId} />}
          />

          {pickerPeriods.length === 0 ? (
            <div className="mt-8">
              <AuroraEmpty
                icon={ClipboardList}
                text="No saved years yet."
                sub="Import a trial balance to get started."
                action={
                  <AuroraLightButton to={addDataHref(uiV2, { add: 'tb' })} icon={<CloudUpload size={15} aria-hidden="true" />}>
                    Add a trial balance
                  </AuroraLightButton>
                }
              />
            </div>
          ) : (
            <AuroraSection first icon={ClipboardList} title="Your schedules" subtitle="Pick one and fill in the table" count={periodName}>
              <div className="fsub-nav fsub-nav-in scrollbar-none mb-5 overflow-x-auto">
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

              <div ref={editorRef} className="fsub-sched">
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
              </div>
            </AuroraSection>
          )}

          <FinanceMore current="reports" only={['reports', 'statements', 'budget', 'cash']} />

          <HowThisWorks>
            <p>
              Capital projects and cash &amp; investment accounts are kept per year. Fill in the tables and the next
              board report picks up the totals automatically.
            </p>
            <p>
              Capital Budget tracks capital projects against budget; over/(under) and totals are worked out in the
              board packet.
            </p>
            <p>
              Cash &amp; Investments lists bank and investment accounts with insured vs. uninsured amounts. Enter rates
              as a percent (4.25 = 4.25%).
            </p>
            <p>Capital Campaign tracks campaign lines against budget; the difference to budget is worked out in the packet.</p>
            <p>Changes save as you type.</p>
          </HowThisWorks>
        </FinanceSubPage>
      </main>
    </div>
  )
}
