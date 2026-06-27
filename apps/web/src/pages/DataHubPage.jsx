// ─────────────────────────────────────────────────────────────────────────────
// Data hub — the ONE friendly, guided place to get a school's data into Dollaz.
// v1 REUSES existing surfaces: it EMBEDS MonthlyActualsPanel + OperationalDataPanel
// unforked and LINKS out to /statements, /budget, /reports/schedules, /readiness.
// A QuickBooks fast-path card sits on top, and Penny (GuideMascot) points at the
// next incomplete step. Shell mirrors ReportsPage (TopBar + BillingBanner +
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
  X,
} from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import BillingBanner from '../components/BillingBanner.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { usePersistence } from '../context/PersistenceContext.jsx'
import { useDataStatus } from '../hooks/useDataStatus.js'
import QuickBooksCard from '../components/datahub/QuickBooksCard.jsx'
import SourceCard from '../components/datahub/SourceCard.jsx'
import GuideMascot from '../components/datahub/GuideMascot.jsx'
import MonthlyActualsPanel from '../components/monthly/MonthlyActualsPanel.jsx'
import OperationalDataPanel from '../components/analytics/OperationalDataPanel.jsx'

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
    action: 'link',
    to: '/statements',
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
    action: 'link',
    to: '/budget',
    cta: 'Open budget',
  },
  {
    key: 'schedules',
    title: 'Supporting schedules',
    Icon: Landmark,
    what:
      'Capital projects, cash & investments, and campaigns that round out your board packet.',
    action: 'link',
    cta: 'Open schedules',
  },
  {
    key: 'compliance',
    title: 'Compliance inputs',
    Icon: ShieldCheck,
    what:
      'A few questions about scholarships and banking so we can check your Florida scholarship review readiness — only needed when you’re preparing for an audit or readiness check.',
    action: 'link',
    to: '/readiness',
    cta: 'Open readiness',
  },
]

export default function DataHubPage() {
  const { activeSchool } = useSchools()
  const { periods } = usePersistence()
  const schoolId = activeSchool?.id ?? null
  const isOwnerOrAccountant =
    activeSchool?.role === 'owner' || activeSchool?.role === 'accountant'

  // Period selector — ReportsPage idiom (newest snapshot period preselected).
  const snapshotPeriods = useMemo(
    () => (periods || []).filter((p) => p.hasSnapshot),
    [periods],
  )
  const defaultPeriodId = snapshotPeriods[0]?.id ?? (periods || [])[0]?.id ?? null

  // Local selection. Adopt the default once it resolves (periods load async),
  // render-time per React docs — NOT setState-in-effect. The user's explicit
  // pick wins thereafter (sync only fires while periodId is still unset).
  const [periodId, setPeriodId] = useState(null)
  if (defaultPeriodId && periodId == null) {
    setPeriodId(defaultPeriodId)
  }

  const selectedPeriod = (periods || []).find((p) => p.id === periodId) || null
  const periodLabel = selectedPeriod?.label || ''

  const { data, loading, error, notEntitled, refetch } = useDataStatus(schoolId, periodId)
  const sources = data?.sources || null
  const summary = data?.summary || null

  const [modalKey, setModalKey] = useState(null) // which embed panel is open in the modal
  const [tourKey, setTourKey] = useState(null) // card Penny is highlighting during the walkthrough
  const mascotRef = useRef(null)

  // No-period state: nothing to work on yet.
  const noPeriods = (periods || []).length === 0

  const needsYou = summary?.needsYou ?? 0
  const inProgress = summary?.inProgress ?? 0
  const allReady = !!summary?.allReady

  return (
    <div className="min-h-screen bg-section">
      <TopBar />
      <BillingBanner />
      <main className="mx-auto max-w-[1100px] px-4 py-8 sm:px-8">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between"
        >
          <div className="max-w-2xl">
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">Data</p>
            <h1 className="mt-1 font-serif text-3xl font-semibold text-navy">Get your numbers in</h1>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
              This is the one place to bring your school&apos;s data into Dollaz. Add what you have —
              we&apos;ll turn it into your statements, board reports, and readiness checks. Penny will
              walk you through it. Most schools finish the essentials in a few minutes.
            </p>
          </div>

          {!noPeriods && (
            <div className="flex shrink-0 flex-col items-start gap-2.5 sm:items-end">
              <label className="flex items-center gap-2 text-[12px] font-semibold text-muted">
                <span className="uppercase tracking-[0.1em]">Working on:</span>
                <select
                  value={periodId || ''}
                  onChange={(e) => setPeriodId(e.target.value)}
                  className="rounded-lg border-2 border-gold/40 bg-white px-3 py-1.5 text-[13px] font-semibold text-navy outline-none ring-gold/40 focus-visible:ring-2"
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
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-bold ${
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
                  type="button"
                  onClick={() => mascotRef.current?.replay()}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 px-3 py-1 text-[12px] font-bold uppercase tracking-[0.06em] text-gold transition-colors hover:bg-gold/5"
                >
                  <Sparkles size={13} /> Show me around
                </button>
              </div>
            </div>
          )}
        </motion.header>

        {noPeriods ? (
          <NoPeriodCard />
        ) : (
          <>
            {/* QuickBooks fast-path (top). */}
            <QuickBooksCard quickbooks={data?.quickbooks} />

            {/* Guided checklist. */}
            {loading && !sources ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                <p className="mt-1 text-[13px] text-muted">
                  Reactivate your plan to load and review your data — see the banner above to manage billing.
                </p>
              </div>
            ) : error ? (
              <div className="rounded-2xl border-2 border-rule/60 bg-white px-6 py-10 text-center">
                <p className="font-serif text-lg text-navy">Couldn’t load your data status</p>
                <p className="mt-1 text-[13px] text-muted">{error}</p>
                <button
                  type="button"
                  onClick={refetch}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-gold/60 bg-gold/10 px-4 py-2 text-[13px] font-semibold text-navy transition-all hover:bg-gold/20"
                >
                  Try again
                </button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {SOURCES.map((s) => (
                  <SourceCard
                    key={s.key}
                    source={s}
                    status={sources?.[s.key]}
                    isActive={(tourKey ?? summary?.nextStep) === s.key}
                    onOpen={() => setModalKey(s.key)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {/* Embed modal (Monthly / Operational) — opens instead of expanding inline. */}
      <DataEmbedModal
        openKey={modalKey}
        onClose={() => setModalKey(null)}
        schoolId={schoolId}
        periodId={periodId}
        periodLabel={periodLabel}
        canEdit={isOwnerOrAccountant}
        onSaved={refetch}
      />

      {/* The star — Penny. Renders once summary is known (and not on empty-school). */}
      {!noPeriods && summary && (
        <GuideMascot ref={mascotRef} summary={summary} onActiveStep={setTourKey} />
      )}
    </div>
  )
}

// Embed modal (render-helper, module scope — not a nested component def). Shows the
// Monthly or Operational panel in a centered popup instead of expanding the card.
function DataEmbedModal({ openKey, onClose, schoolId, periodId, periodLabel, canEdit, onSaved }) {
  const isOpen = openKey === 'monthly' || openKey === 'operational'
  const title = openKey === 'monthly' ? 'Monthly numbers' : 'Enrollment & aid'

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
            className="relative z-10 flex max-h-[88vh] w-full max-w-[760px] flex-col overflow-hidden rounded-2xl border-2 border-gold/30 bg-section shadow-2xl"
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
            <div className="overflow-y-auto p-5">
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
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Render-helper (not a nested component def): no reporting period yet.
function NoPeriodCard() {
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
      <p className="mx-auto mt-1.5 max-w-md text-[13.5px] leading-relaxed text-muted">
        Start by adding a trial balance — we&apos;ll set up the period and turn it into your financial
        statements automatically.
      </p>
      <a
        href="/statements"
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-gold-gradient px-4 py-2.5 text-[13px] font-bold uppercase tracking-[0.08em] text-navy shadow-glow transition-transform hover:-translate-y-0.5"
      >
        Add a trial balance
      </a>
    </motion.div>
  )
}
