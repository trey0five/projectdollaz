// ─────────────────────────────────────────────────────────────────────────────
// Data hub — the ONE friendly, guided place to get a school's data into Dollaz.
// v1 REUSES existing surfaces: it EMBEDS MonthlyActualsPanel + OperationalDataPanel
// + BudgetSetup unforked and LINKS out to /statements, /reports/schedules, /readiness.
// A QuickBooks fast-path card sits on top, and the global Penny (usePenny) points
// at the next incomplete step. Shell mirrors ReportsPage (AppShell chrome + BillingBanner +
// max-w-[1100px] main). Period selector reuses the ReportsPage idiom verbatim:
// snapshotPeriods[0]?.id ?? periods[0]?.id, with a local useState synced on key
// (NOT setState-in-effect). SOURCES is a module-scope config array (like
// ReportsPage's REPORTS) — never an in-render component def.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  FileSpreadsheet,
  CalendarClock,
  ClipboardList,
  Wallet,
  Landmark,
  ShieldCheck,
  Sparkles,
  CircleCheck,
  TrendingUp,
  X,
} from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { usePersistence } from '../context/PersistenceContext.jsx'
import { useDataStatus } from '../hooks/useDataStatus.js'
import QuickBooksCard from '../components/datahub/QuickBooksCard.jsx'
import SourceCard from '../components/datahub/SourceCard.jsx'
import { usePenny } from '../context/PennyContext.jsx'
import MonthlyActualsPanel from '../components/monthly/MonthlyActualsPanel.jsx'
import OperationalDataPanel from '../components/analytics/OperationalDataPanel.jsx'
import TrialBalanceModalBody from '../components/datahub/TrialBalanceModalBody.jsx'
import BudgetSetup from '../components/budget/BudgetSetup.jsx'
import ForecastWorkspace from '../components/budget/ForecastWorkspace.jsx'
import SchedulesEmbed from '../components/datahub/SchedulesEmbed.jsx'
import ComplianceIntakePanel from '../components/readiness/ComplianceIntakePanel.jsx'
import { useBudget, useBudgetContext } from '../hooks/useAnalytics.js'
import { useComplianceInputs } from '../hooks/useCompliance.js'

// Module-scope checklist config (NOT in-render). The `key` matches the
// dataStatusContract `sources` keys + `summary.order`; SourceCard reads
// sources[key] for status/detail. `action` = 'embed' | 'link'.
const SOURCES = [
  {
    key: 'trialBalances',
    title: 'Trial balance',
    Icon: FileSpreadsheet,
    what:
      'Your trial balance is the list of every account and its balance. It’s the one thing we truly need — we turn it into your four financial statements automatically.',
    action: 'embed',
    cta: 'Add trial balance',
  },
  {
    key: 'monthly',
    title: 'Monthly numbers',
    Icon: CalendarClock,
    what:
      'Add a month-end trial balance for each month to track how the year is going. Optional, but it powers your month-by-month board report.',
    action: 'embed',
    cta: 'Manage months',
  },
  {
    key: 'operational',
    title: 'Enrollment & aid',
    Icon: ClipboardList,
    what:
      'Tell us your enrollment, financial aid, and staffing. We use it to show per-student costs and key ratios — the numbers boards always ask about.',
    action: 'embed',
    cta: 'Enter enrollment & aid',
  },
  {
    key: 'budget',
    title: 'Budget',
    Icon: Wallet,
    what:
      'Import your budget so every report can show budget vs. actual — how you’re tracking against the plan.',
    action: 'embed',
    cta: 'Set up budget',
  },
  {
    key: 'forecast',
    title: 'Year-end forecast',
    Icon: TrendingUp,
    what:
      'Revise your assumptions and add incoming students to project where the year lands. We compare it to your budget for the board — view it anytime in Reports.',
    action: 'embed',
    cta: 'Update forecast',
  },
  {
    key: 'schedules',
    title: 'Supporting schedules',
    Icon: Landmark,
    what:
      'Capital projects, cash & investments, and campaigns that round out your board packet.',
    action: 'embed',
    cta: 'Open schedules',
  },
  {
    key: 'compliance',
    title: 'Compliance inputs',
    Icon: ShieldCheck,
    what:
      'A few questions about scholarships and banking so we can check your Florida scholarship review readiness — only needed when you’re preparing for an audit or readiness check.',
    action: 'embed',
    cta: 'Enter compliance inputs',
  },
]

// Per-card bubble copy for Penny's "Show me around" tour (moved verbatim out of the
// former GuideMascot before it was deleted). Keyed by source key; falls back to s.what.
const HINTS = {
  trialBalances: "Start here. Drop in your trial balance and I'll turn it into your statements.",
  monthly: 'Adding each month here lets your board watch the year unfold.',
  operational: 'A few quick numbers here unlock your per-student metrics.',
  budget: 'Bring in your budget so we can compare plan vs. reality.',
  forecast: 'Project where the year lands and compare it to your budget — view it in Reports.',
  schedules: 'Add supporting schedules if your board packet needs them.',
  compliance: 'A few compliance answers prep you for a readiness check.',
}

export default function DataHubPage() {
  const { activeSchool } = useSchools()
  const penny = usePenny()
  const { periods, hydratedFiles, activePeriod, hydrationToken } = usePersistence()
  const schoolId = activeSchool?.id ?? null
  const isOwnerOrAccountant =
    activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'

  // Period selector — ReportsPage idiom (newest snapshot period preselected).
  const snapshotPeriods = useMemo(
    () => (periods || []).filter((p) => p.hasSnapshot),
    [periods],
  )
  // The hub is about getting data IN, so default to the live/active period (the one
  // you're building) — which is also the period the trial-balance intake uploads to,
  // keeping the card status and the modal in sync. Falls back to newest-with-snapshot.
  const defaultPeriodId =
    activePeriod?.id ?? snapshotPeriods[0]?.id ?? (periods || [])[0]?.id ?? null

  // Local selection. Adopt the default once it resolves (periods load async),
  // render-time per React docs — NOT setState-in-effect. The user's explicit
  // pick wins thereafter (sync only fires while periodId is still unset).
  const [periodId, setPeriodId] = useState(null)
  // Reset the selection when the ACTIVE SCHOOL changes — otherwise a period id from
  // the previous school lingers (it's non-null, so the adopt below never re-fires),
  // and the status fetch hits /schools/<newSchool>/periods/<oldSchoolsPeriod> which
  // isn't owned by the new school → 404 → "Couldn't load your data status" on every
  // school toggle. Dropping it here re-adopts the new school's default next.
  const [lastSchoolId, setLastSchoolId] = useState(schoolId)
  if (schoolId !== lastSchoolId) {
    setLastSchoolId(schoolId)
    setPeriodId(null)
  }
  if (defaultPeriodId && periodId == null) {
    setPeriodId(defaultPeriodId)
  }

  const selectedPeriod = (periods || []).find((p) => p.id === periodId) || null
  const periodLabel = selectedPeriod?.label || ''

  const { data, loading, error, notEntitled, refetch } = useDataStatus(schoolId, periodId)
  const sources = data?.sources || null

  // Forecast input embed needs the saved budget + budget context to seed the
  // ForecastWorkspace. Fetched UNCONDITIONALLY (not gated on which modal is open)
  // to avoid conditional-hook violations — both hooks key on (schoolId, periodId)
  // and tolerate nulls, mirroring how BudgetPage loads them.
  const { budget: forecastBudget } = useBudget(schoolId, periodId)
  const { context: forecastBudgetContext } = useBudgetContext(schoolId, periodId)
  // Compliance intake needs its inputs/loading/reload passed in (the panel doesn't
  // self-fetch). Fetched unconditionally (keyed on schoolId/periodId) like the
  // forecast hooks, so the embed modal can mount ComplianceIntakePanel.
  const {
    inputs: complianceInputs,
    loading: complianceLoading,
    reload: reloadComplianceInputs,
  } = useComplianceInputs(schoolId, periodId)

  // After a trial-balance save inside the modal, PersistenceContext bumps
  // hydrationToken — re-pull the data-status so the Trial balance card flips to
  // Done (skip the initial mount; useDataStatus already loads then).
  const firstTokenRef = useRef(true)
  useEffect(() => {
    if (firstTokenRef.current) {
      firstTokenRef.current = false
      return
    }
    refetch()
  }, [hydrationToken, refetch])
  const summary = data?.summary || null

  const [modalKey, setModalKey] = useState(null) // which embed panel is open in the modal

  // Penny agent: a `navigate` event with openModal dispatches this CustomEvent so
  // the hub opens the requested embed panel (e.g. she walks the user to the budget
  // setup). 'none' is the no-op sentinel. Pure side-effect listener with cleanup.
  useEffect(() => {
    const onOpenModal = (e) => {
      const key = e?.detail?.openKey
      if (key && key !== 'none') setModalKey(key)
    }
    window.addEventListener('penny:open-datahub-modal', onOpenModal)
    return () => window.removeEventListener('penny:open-datahub-modal', onOpenModal)
  }, [])

  // Penny autonomous-write refresh: an import re-pulls the data-status so the
  // checklist cards flip to Done. refetch is stable from useDataStatus.
  useEffect(() => {
    const onDataChanged = (e) => {
      if (e?.detail?.key === 'dataStatus') refetch()
    }
    window.addEventListener('penny:data-changed', onDataChanged)
    return () => window.removeEventListener('penny:data-changed', onDataChanged)
  }, [refetch])

  // No-period state: nothing to work on yet.
  const noPeriods = (periods || []).length === 0

  const needsYou = summary?.needsYou ?? 0
  const inProgress = summary?.inProgress ?? 0
  const allReady = !!summary?.allReady

  // First-time guide (intent fire — NOT setState-for-derived-state). Penny glides to
  // the trial-balance card (or the no-period CTA) and says "start here" the first time
  // the TB step is incomplete. The {once} key + guideTo's idempotent guard keep re-runs
  // cheap and prevent nagging on return visits.
  const tbIncomplete = !!summary && summary.nextStep === 'trialBalances'
  useEffect(() => {
    if (!schoolId) return
    if (noPeriods) {
      penny.guideTo(
        {
          targetId: 'datahub-noperiod-cta',
          cardKey: 'trialBalances',
          message:
            "Start here — let's upload THIS year's trial balance and I'll build your statements.",
          action: { label: 'Add a trial balance', onClick: () => setModalKey('trialBalances') },
        },
        { once: `firsttb:${schoolId}` },
      )
    } else if (tbIncomplete) {
      penny.guideTo(
        {
          targetId: 'datahub-card-trialBalances',
          cardKey: 'trialBalances',
          message:
            "Start here — upload THIS year's trial balance and I'll turn it into your four statements.",
          action: { label: 'Add trial balance', onClick: () => setModalKey('trialBalances') },
        },
        { once: `firsttb:${schoolId}` },
      )
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schoolId, noPeriods, summary?.nextStep, penny])

  // "Show me around" tour — one step per source card (pure derivation; no state).
  const tourSteps = useMemo(
    () =>
      SOURCES.map((s) => ({
        targetId: `datahub-card-${s.key}`,
        cardKey: s.key,
        message: HINTS[s.key] ?? s.what,
        ...(s.action === 'embed'
          ? { action: { label: s.cta, onClick: () => setModalKey(s.key) } }
          : {}),
      })),
    [],
  )

  // Which card Penny is currently pointing at (pure derivation — no state, no effect).
  const guideCardKey = penny.guide
    ? penny.guide.steps[penny.guide.index]?.cardKey ?? null
    : null

  return (
    <div className="min-h-screen bg-section">
      <BillingBanner />
      <main className="mx-auto max-w-[1100px] px-4 py-8 sm:px-8">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
        >
          <div className="max-w-2xl">
            <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-gold">Data</p>
            <h1 className="mt-1 font-serif text-2xl font-semibold text-navy sm:text-3xl">Get your numbers in</h1>
            <p className="mt-1.5 text-[16px] leading-relaxed text-muted">
              This is the one place to bring your school&apos;s data into Dollaz. Add what you have —
              we&apos;ll turn it into your statements, board reports, and readiness checks. Penny will
              walk you through it. Most schools finish the essentials in a few minutes.
            </p>
          </div>

          {!noPeriods && (
            <div className="flex shrink-0 flex-col items-start gap-2.5 sm:items-end">
              <label className="flex items-center gap-2 text-[14px] font-semibold text-muted">
                <span className="uppercase tracking-[0.1em]">Working on:</span>
                <select
                  id="datahub-period-select"
                  value={periodId || ''}
                  onChange={(e) => setPeriodId(e.target.value)}
                  className="rounded-lg border-2 border-gold/40 bg-white px-3 py-1.5 text-[15px] font-semibold text-navy outline-none ring-gold/40 focus-visible:ring-2"
                >
                  {(periods || []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[14px] font-bold ${
                    allReady
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'border border-gold/40 bg-gold/10 text-amber-700'
                  }`}
                >
                  {allReady ? (
                    <>
                      <CircleCheck size={14} /> All set
                    </>
                  ) : (
                    <>
                      {needsYou} need you · {inProgress} in progress
                    </>
                  )}
                </span>
                <button
                  id="datahub-tour-button"
                  type="button"
                  onClick={() => penny.runTour(tourSteps)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 px-3 py-1 text-[14px] font-bold uppercase tracking-[0.06em] text-gold transition-colors hover:bg-gold/5"
                >
                  <Sparkles size={13} /> Show me around
                </button>
              </div>
            </div>
          )}
        </motion.header>

        {noPeriods ? (
          <NoPeriodCard onAdd={() => setModalKey('trialBalances')} />
        ) : (
          <>
            {/* QuickBooks fast-path (top). */}
            <QuickBooksCard quickbooks={data?.quickbooks} />

            {/* Guided checklist. */}
            {loading && !sources ? (
              <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-3">
                {SOURCES.map((s) => (
                  <div
                    key={s.key}
                    className="h-44 animate-pulse rounded-2xl border-2 border-rule/40 bg-white/60"
                  />
                ))}
              </div>
            ) : notEntitled ? (
              <div className="rounded-2xl border-2 border-rule/60 bg-white px-6 py-10 text-center">
                <p className="font-serif text-lg text-navy">Your subscription is paused</p>
                <p className="mt-1 text-[15px] text-muted">
                  Reactivate your plan to load and review your data — see the banner above to manage billing.
                </p>
              </div>
            ) : error ? (
              <div className="rounded-2xl border-2 border-rule/60 bg-white px-6 py-10 text-center">
                <p className="font-serif text-lg text-navy">Couldn’t load your data status</p>
                <p className="mt-1 text-[15px] text-muted">{error}</p>
                <button
                  type="button"
                  onClick={refetch}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-gold/60 bg-gold/10 px-4 py-2 text-[15px] font-semibold text-navy transition-all hover:bg-gold/20"
                >
                  Try again
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-3">
                {SOURCES.map((s) => (
                  <SourceCard
                    key={s.key}
                    source={s}
                    status={sources?.[s.key]}
                    isActive={(guideCardKey ?? summary?.nextStep) === s.key}
                    onOpen={() => setModalKey(s.key)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Embed modal (Monthly / Operational / Budget) — opens instead of expanding inline. */}
      <DataEmbedModal
        openKey={modalKey}
        onClose={() => {
          if (modalKey === 'schedules') refetch()
          setModalKey(null)
        }}
        schoolId={schoolId}
        periodId={periodId}
        periodLabel={periodLabel}
        canEdit={isOwnerOrAccountant}
        onSaved={refetch}
        budget={forecastBudget}
        budgetContext={forecastBudgetContext}
        complianceInputs={complianceInputs}
        complianceLoading={complianceLoading}
        reloadComplianceInputs={reloadComplianceInputs}
        school={activeSchool}
        hydratedFiles={hydratedFiles}
        activePeriod={activePeriod}
        hydrationToken={hydrationToken}
        onOpenMonthly={() => setModalKey('monthly')}
      />
    </div>
  )
}

// Embed modal (render-helper, module scope — not a nested component def). Shows the
// Monthly, Operational, or Budget setup panel in a centered popup instead of
// expanding the card.
function DataEmbedModal({
  openKey,
  onClose,
  schoolId,
  periodId,
  periodLabel,
  canEdit,
  onSaved,
  budget,
  budgetContext,
  complianceInputs,
  complianceLoading,
  reloadComplianceInputs,
  school,
  hydratedFiles,
  activePeriod,
  hydrationToken,
  onOpenMonthly,
}) {
  const isTb = openKey === 'trialBalances'
  const isBudget = openKey === 'budget'
  const isForecast = openKey === 'forecast'
  const isSchedules = openKey === 'schedules'
  const isCompliance = openKey === 'compliance'
  const isWide = isTb || isBudget || isForecast || isSchedules
  const isOpen =
    isTb ||
    isBudget ||
    isForecast ||
    isSchedules ||
    isCompliance ||
    openKey === 'monthly' ||
    openKey === 'operational'
  const title = isTb
    ? 'Add your trial balances'
    : isBudget
      ? 'Set up your budget'
      : isForecast
        ? 'Year-end forecast'
        : isSchedules
          ? 'Supporting schedules'
          : isCompliance
            ? 'Compliance inputs'
            : openKey === 'monthly'
              ? 'Monthly numbers'
              : 'Enrollment & aid'

  useEffect(() => {
    if (!isOpen) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-navy/40 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.2 }}
            className={`relative z-10 flex max-h-[90vh] w-full flex-col overflow-hidden rounded-2xl border-2 border-gold/30 bg-section shadow-2xl ${isForecast ? 'max-w-[1360px]' : isWide ? 'max-w-[1040px]' : 'max-w-[760px]'}`}
          >
            <div className="flex items-center justify-between border-b border-rule/60 bg-white px-5 py-3.5">
              <h2 className="font-serif text-lg font-semibold text-navy">{title}</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-section hover:text-navy"
              >
                <X size={18} />
              </button>
            </div>
            <div className={`overflow-y-auto ${isTb ? 'p-0' : 'p-5'}`}>
              {isTb && (
                // Trial-balance intake with two tabs: today's single-year 3-slot
                // intake, and the bulk "Add years" uploader that lights up the
                // annual trend. Both save through PersistenceContext (bumping
                // hydrationToken), which the hub watches to refresh card status.
                <TrialBalanceModalBody
                  school={school}
                  hydratedFiles={hydratedFiles}
                  activePeriod={activePeriod}
                  hydrationToken={hydrationToken}
                  canEdit={canEdit}
                  onOpenMonthly={onOpenMonthly}
                />
              )}
              {openKey === 'monthly' && periodId && (
                <MonthlyActualsPanel schoolId={schoolId} periodId={periodId} canEdit={canEdit} />
              )}
              {openKey === 'operational' && periodId && (
                <OperationalDataPanel
                  schoolId={schoolId}
                  periodId={periodId}
                  periodLabel={periodLabel}
                  canEdit={canEdit}
                  onSaved={onSaved}
                />
              )}
              {openKey === 'budget' && periodId && (
                <BudgetSetup
                  schoolId={schoolId}
                  periodId={periodId}
                  canEdit={canEdit}
                  onSaved={onSaved}
                />
              )}
              {openKey === 'forecast' && periodId && (
                // Forecast INPUT, reused unforked from the (removed) Budget tab.
                // It autosaves + self-refetches its own preview — no onSaved prop.
                // The card stays "Optional" (no forecast data-status key, intended).
                <ForecastWorkspace
                  key={`forecast-${schoolId}:${periodId}`}
                  schoolId={schoolId}
                  periodId={periodId}
                  canEdit={canEdit}
                  budget={budget}
                  budgetContext={budgetContext}
                />
              )}
              {openKey === 'schedules' && periodId && (
                // The three supporting-schedule workspaces, tabbed. They autosave;
                // the hub refetches the schedules status on modal close (onClose).
                <SchedulesEmbed
                  key={`schedules-${schoolId}:${periodId}`}
                  schoolId={schoolId}
                  periodId={periodId}
                  canEdit={canEdit}
                />
              )}
              {openKey === 'compliance' && periodId && (
                // Compliance attestation inputs (scholarships/banking). On save it
                // calls onSaved -> the hub refetches data-status (deriveCompliance
                // flips the card to Done once the row is materially filled).
                <ComplianceIntakePanel
                  schoolId={schoolId}
                  periodId={periodId}
                  periodLabel={periodLabel}
                  inputs={complianceInputs}
                  loading={complianceLoading}
                  canEdit={canEdit}
                  reloadInputs={reloadComplianceInputs}
                  onSaved={onSaved}
                />
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Render-helper (not a nested component def): no reporting period yet.
function NoPeriodCard({ onAdd }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border-2 border-gold/40 bg-white p-7 text-center shadow-card"
    >
      <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-gold/15 text-gold">
        <FileSpreadsheet size={24} />
      </span>
      <h2 className="font-serif text-xl font-semibold text-navy">
        Let&apos;s create your first reporting period
      </h2>
      <p className="mx-auto mt-1.5 max-w-md text-[15.5px] leading-relaxed text-muted">
        Start by adding a trial balance — we&apos;ll set up the period and turn it into your financial
        statements automatically.
      </p>
      <button
        id="datahub-noperiod-cta"
        type="button"
        onClick={onAdd}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-gold-gradient px-4 py-2.5 text-[15px] font-bold uppercase tracking-[0.08em] text-navy shadow-glow transition-transform hover:-translate-y-0.5"
      >
        Add a trial balance
      </button>
    </motion.div>
  )
}
