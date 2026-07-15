import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ArrowLeft, ShieldCheck } from 'lucide-react'
import { useSchools } from '../../context/SchoolContext.jsx'
import { useBilling } from '../../context/BillingContext.jsx'
import { usePersistence } from '../../context/PersistenceContext.jsx'
import { useCompliance, useComplianceInputs } from '../../hooks/useCompliance.js'
import { useCorrectiveActionPlan } from '../../hooks/useCorrectiveActionPlan.js'
import { useChecklist } from '../../hooks/useChecklist.js'
import { sectionTitle } from '../../lib/complianceMeta.js'
import { statusMeta } from '../../lib/metricMeta.js'
import MetricSection from '../analytics/MetricSection.jsx'
import EntitlementPausedPanel from '../analytics/EntitlementPausedPanel.jsx'
import ContextBar from '../analytics/ContextBar.jsx'
import StatusDot from '../analytics/StatusDot.jsx'
import { HeadlineSkeleton, MetricCardSkeleton } from '../analytics/skeletons.jsx'
import DisclaimerBanner from './DisclaimerBanner.jsx'
import TriggerHeader from './TriggerHeader.jsx'
import ReadinessSummary from './ReadinessSummary.jsx'
import ComplianceIntakePanel from './ComplianceIntakePanel.jsx'
import ScholarshipReconciliationSection from './reconciliation/ScholarshipReconciliationSection.jsx'
import CorrectiveActionPlanSection from './cap/CorrectiveActionPlanSection.jsx'
import YearEndChecklistSection from './checklist/YearEndChecklistSection.jsx'
import ReadinessTabs from './ReadinessTabs.jsx'
import RuleRow from './RuleRow.jsx'
import BackLink from '../ui/BackLink.jsx'

// Subtle tab badge chip reusing the health palette (good/watch/risk/neutral).
function TabBadge({ palette, children }) {
  const meta = statusMeta(palette)
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[12px] font-bold leading-none tabular-nums ${meta.chip}`}
    >
      <StatusDot status={palette} size={6} />
      {children}
    </span>
  )
}

function PageHeader() {
  return (
    <div className="mb-5">
      <BackLink className="mb-4" />
      <div className="flex items-center gap-2.5">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-gold-gradient text-white shadow-glow">
          <ShieldCheck size={22} />
        </span>
        <div>
          <h1 className="font-serif text-xl font-semibold text-navy sm:text-2xl">
            Review Readiness
          </h1>
          <p className="text-[15px] text-muted">
            Self-check against the Florida scholarship AUP before your CPA engagement.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function ReviewReadinessPanel() {
  const { activeSchool } = useSchools()
  const schoolId = activeSchool?.id ?? null
  const { loading: billingLoading, entitled } = useBilling()
  const { periods, hydrating } = usePersistence()

  const canEdit = activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'

  const savedPeriods = useMemo(
    () => (periods || []).filter((p) => p.hasSnapshot),
    [periods],
  )

  const [selectedPeriodId, setSelectedPeriodId] = useState(null)
  useEffect(() => {
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      if (savedPeriods.length === 0) {
        setSelectedPeriodId((cur) => (cur === null ? cur : null))
      } else {
        setSelectedPeriodId((cur) =>
          savedPeriods.some((p) => p.id === cur) ? cur : savedPeriods[0].id,
        )
      }
    })
    return () => {
      cancelled = true
    }
  }, [savedPeriods])

  const {
    data,
    sections,
    summary,
    loading: complianceLoading,
    notEntitled: complianceBlocked,
    reload,
  } = useCompliance(schoolId, selectedPeriodId)

  const {
    inputs,
    loading: inputsLoading,
    notEntitled: inputsBlocked,
    reload: reloadInputs,
  } = useComplianceInputs(schoolId, selectedPeriodId)

  const notEntitled = complianceBlocked || inputsBlocked

  // Read-only badge instances (same endpoints the sections self-fetch; web-only).
  // These drive the small count chips on the CAP + Checklist tab labels.
  const { summary: capSummary } = useCorrectiveActionPlan(schoolId, selectedPeriodId)
  const { rollup: checklistRollup } = useChecklist(schoolId, selectedPeriodId)

  // ── Robust sticky offset for the tab bar. ContextBar is `sticky top-2` (8px)
  //    and collapses to a taller stacked column below the lg breakpoint, so a
  //    hard-coded tab offset can crowd it at narrow widths. Measure the live
  //    ContextBar height and park the tab bar just below it (8px top + height +
  //    8px gap). Falls back to a safe default until measured. ──
  const contextBarRef = useRef(null)
  const [tabTop, setTabTop] = useState(64)
  // Re-attaches the observer whenever the ContextBar mounts/unmounts (it is gated
  // behind the skeleton + saved-period checks); the ref guard makes it a no-op
  // while unmounted, and the ResizeObserver then tracks live height changes.
  const contextBarMounted =
    !(billingLoading || hydrating || ((complianceLoading || inputsLoading) && !data)) &&
    savedPeriods.length > 0
  useLayoutEffect(() => {
    const el = contextBarRef.current
    if (!el || typeof ResizeObserver === 'undefined') return undefined
    const measure = () => setTabTop(Math.round(8 + el.offsetHeight + 8))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    window.addEventListener('resize', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [contextBarMounted])

  // ── Active tab (default = findings). Reset to findings when the period changes,
  //    adjusting state during render (per React docs) to avoid a cascading effect. ──
  const reduce = useReducedMotion()
  const [tab, setTab] = useState('findings')
  const [prevPeriodId, setPrevPeriodId] = useState(selectedPeriodId)
  if (selectedPeriodId !== prevPeriodId) {
    setPrevPeriodId(selectedPeriodId)
    setTab('findings')
  }

  // ── Entitlement gate (single paused panel) ─────────────────────────────────
  if (!billingLoading && (!entitled || notEntitled)) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-10">
        <PageHeader />
        <EntitlementPausedPanel />
      </div>
    )
  }

  const initialLoading = billingLoading || hydrating

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!initialLoading && savedPeriods.length === 0) {
    return (
      <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-10">
        <PageHeader />
        <div className="card-soft border-dashed px-6 py-14 text-center">
          <p className="font-serif text-lg italic text-muted">No saved statements yet.</p>
          <p className="mt-1 text-[15px] text-muted">
            Generate and save a period on the dashboard to run the readiness checks.
          </p>
          <Link to="/app" className="btn-primary mt-6">
            Go to dashboard
          </Link>
        </div>
      </div>
    )
  }

  const showSkeleton =
    initialLoading || ((complianceLoading || inputsLoading) && !data)

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-8 sm:px-10">
      <PageHeader />

      {!showSkeleton && savedPeriods.length > 0 && (
        <div ref={contextBarRef}>
          <ContextBar
            periods={savedPeriods}
            activePeriodId={selectedPeriodId}
            onSelectPeriod={setSelectedPeriodId}
          />
        </div>
      )}

      {showSkeleton ? (
        <div className="space-y-6">
          <HeadlineSkeleton />
          <div className="grid grid-cols-1 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <MetricCardSkeleton key={i} />
            ))}
          </div>
        </div>
      ) : (
        (() => {
          // ── PINNED OVERVIEW — always visible above the tabs. The disclaimer,
          //    $250k trigger (+ program-tier selector) and summary never hide
          //    behind a tab switch. ──
          const counts = summary?.counts ?? {}
          const material = counts.material ?? 0
          const reportable = counts.reportable ?? 0
          const findingsBadge =
            material > 0 ? (
              <TabBadge palette="risk">{material}</TabBadge>
            ) : reportable > 0 ? (
              <TabBadge palette="watch">{reportable}</TabBadge>
            ) : null

          const capOpen = capSummary?.openCount ?? 0
          const capBadge = capOpen > 0 ? <TabBadge palette="watch">{capOpen}</TabBadge> : null

          const checklistBadge = checklistRollup ? (
            (() => {
              const total = checklistRollup.total ?? 0
              const cleared = (checklistRollup.done ?? 0) + (checklistRollup.na ?? 0)
              const complete = total > 0 && cleared >= total
              return (
                <TabBadge palette={complete ? 'good' : 'neutral'}>
                  {cleared}/{total}
                </TabBadge>
              )
            })()
          ) : null

          const tabs = [
            { key: 'findings', label: 'Findings', short: 'Findings', badge: findingsBadge },
            { key: 'intake', label: 'Compliance Intake', short: 'Intake' },
            {
              key: 'reconciliation',
              label: 'Scholarship Reconciliation',
              short: 'Reconciliation',
            },
            { key: 'cap', label: 'Corrective Actions', short: 'Corrective', badge: capBadge },
            {
              key: 'checklist',
              label: 'Year-End Checklist',
              short: 'Checklist',
              badge: checklistBadge,
            },
          ]

          // Tabs other than findings gate on a selected period; fall back if missing.
          const activeTab = !selectedPeriodId && tab !== 'findings' ? 'findings' : tab

          const panelMotion = reduce
            ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
            : {
                initial: { opacity: 0, y: 12 },
                animate: { opacity: 1, y: 0 },
                exit: { opacity: 0, y: -8 },
              }

          return (
            <div className="space-y-7">
              {/* PINNED OVERVIEW */}
              <DisclaimerBanner />

              <TriggerHeader
                summary={summary}
                scholarshipFunds={inputs?.scholarshipFundsReceived ?? null}
                rulesetVersion={data?.rulesetVersion}
                statuteYear={data?.statuteYear}
                programs={inputs?.programs ?? []}
              />

              <ReadinessSummary summary={summary} />

              {/* STICKY TAB BAR — parks just below the sticky ContextBar (z-20)
                  using a measured offset so it never crowds/overlaps ContextBar
                  when it wraps to a taller stacked column at narrow widths.
                  z-10 keeps it under ContextBar + any open dropdown menu (z-50). */}
              <div
                className="sticky z-10 -mx-4 px-4 sm:mx-0 sm:px-0"
                style={{ top: tabTop }}
              >
                <ReadinessTabs tabs={tabs} value={activeTab} onChange={setTab} />
              </div>

              {/* ACTIVE PANEL — only one detail area renders at a time. */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={panelMotion.initial}
                  animate={panelMotion.animate}
                  exit={panelMotion.exit}
                  transition={{ duration: reduce ? 0.15 : 0.25 }}
                >
                  {activeTab === 'findings' && (
                    /* The six AUP sections + Eligibility */
                    <div className="space-y-6">
                      {sections.map((group) => (
                        <MetricSection
                          key={group.section}
                          title={`${group.section} · ${sectionTitle(group.section)}`}
                          subtitle={`${group.findings.length} ${group.findings.length === 1 ? 'check' : 'checks'}`}
                        >
                          <div className="space-y-3">
                            {group.findings.map((f, i) => (
                              <RuleRow key={f.id} finding={f} index={i} />
                            ))}
                          </div>
                        </MetricSection>
                      ))}
                    </div>
                  )}

                  {activeTab === 'intake' && selectedPeriodId && (
                    <ComplianceIntakePanel
                      schoolId={schoolId}
                      periodId={selectedPeriodId}
                      periodLabel={data?.label}
                      inputs={inputs}
                      loading={inputsLoading}
                      canEdit={canEdit}
                      reloadInputs={reloadInputs}
                      onSaved={reload}
                    />
                  )}

                  {/* Phase 2B — Scholarship reconciliation (funding-org
                      disbursements vs recorded scholarship revenue). Adopting the
                      disbursed total as the recorded figure refreshes the 2A
                      intake + findings too. */}
                  {activeTab === 'reconciliation' && selectedPeriodId && (
                    <ScholarshipReconciliationSection
                      schoolId={schoolId}
                      periodId={selectedPeriodId}
                      canEdit={canEdit}
                      onRecordedChanged={async () => {
                        await reloadInputs()
                        await reload()
                      }}
                    />
                  )}

                  {/* Phase 2D — Corrective Action Plan: editable, pre-filled
                      remediation for each material / reportable finding.
                      Self-fetching; export/print self-owned. */}
                  {activeTab === 'cap' && selectedPeriodId && (
                    <CorrectiveActionPlanSection
                      schoolId={schoolId}
                      periodId={selectedPeriodId}
                      canEdit={canEdit}
                    />
                  )}

                  {/* Phase 2C — Year-End Review Checklist: AUP-procedure groups +
                      the documents-to-gather group, each with status + notes + a
                      readiness progress rollup, plus the Workpapers Packet export.
                      Self-fetching. */}
                  {activeTab === 'checklist' && selectedPeriodId && (
                    <YearEndChecklistSection
                      schoolId={schoolId}
                      periodId={selectedPeriodId}
                      canEdit={canEdit}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>
          )
        })()
      )}
    </div>
  )
}
