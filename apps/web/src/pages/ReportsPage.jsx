// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — Reports hub. The /reports landing surface. Phase 1 lists ONE report
// type ("Board Report" — the NBOA-style finance-committee packet); the layout is
// built so more report types slot in later as additional cards. Selecting the
// Board Report opens the 5-step BoardReportWizard inline, with the period
// preselected to the live (newest snapshot) period. Navy/gold theme, framer-motion
// polish. Distinct from the compliance "board packet" (/board-packet/print).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FileBarChart2, Landmark, ArrowRight, ArrowLeft, Lock, CalendarClock, TrendingUp } from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { usePersistence } from '../context/PersistenceContext.jsx'
import BoardReportWizard from '../components/reports/board/BoardReportWizard.jsx'
import MonthlyActualsSection from '../components/monthly/MonthlyActualsSection.jsx'
import ForecastView from '../components/reports/ForecastView.jsx'

// Catalog of report types. Phase 1 ships only the Board Report live; the rest are
// listed as "coming soon" placeholders so the IA reads as a growing hub.
const REPORTS = [
  {
    id: 'board',
    title: 'Board Report',
    blurb:
      'A branded finance-committee packet: budget vs. actual, key indicators, MD&A narrative, and the three core statements — ready to print or save as PDF.',
    live: true,
    Icon: FileBarChart2,
    action: 'wizard',
  },
  {
    id: 'forecast',
    title: 'FYE Forecast',
    blurb:
      'Project where the year lands — driver assumptions, cohort roll-forward, and feeder enrollment. Enter it in the Data hub; it also flows into your board packet.',
    live: true,
    Icon: TrendingUp,
    action: 'inline',
  },
  {
    id: 'monthly',
    title: 'Monthly Actuals',
    blurb:
      'Upload month-end trial balances to build year-to-date actuals — the foundation for month-to-date board columns.',
    live: true,
    Icon: CalendarClock,
    action: 'inline',
  },
  {
    id: 'schedules',
    title: 'Supporting Schedules',
    blurb:
      'Capital projects and cash & investment accounts that flow into your board packet.',
    live: true,
    Icon: Landmark,
    action: 'navigate',
  },
]

export default function ReportsPage() {
  const { activeSchool } = useSchools()
  const { periods } = usePersistence()
  const navigate = useNavigate()
  const [openReport, setOpenReport] = useState(null)

  // Penny autonomous-write refresh: a board-report change (e.g. an MD&A explanation
  // Penny set) broadcasts 'penny:data-changed'. Bump a nonce to re-key the open
  // wizard so it re-pulls — the wizard self-fetches on mount. Pure listener.
  const [boardNonce, setBoardNonce] = useState(0)
  useEffect(() => {
    const onDataChanged = (e) => {
      if (e?.detail?.key === 'boardReport') setBoardNonce((n) => n + 1)
    }
    window.addEventListener('penny:data-changed', onDataChanged)
    return () => window.removeEventListener('penny:data-changed', onDataChanged)
  }, [])

  // Preselect the newest period that actually has a snapshot (the "live" period).
  const snapshotPeriods = useMemo(
    () => (periods || []).filter((p) => p.hasSnapshot),
    [periods],
  )
  const defaultPeriodId = snapshotPeriods[0]?.id ?? (periods || [])[0]?.id ?? null

  // Card select: the Board Report opens the inline 5-step wizard; Supporting
  // Schedules NAVIGATES to its own surface (carrying the live snapshot period).
  const onSelect = (report) => {
    if (report.action === 'navigate') {
      if (report.id === 'schedules') {
        navigate(defaultPeriodId ? `/reports/schedules?period=${defaultPeriodId}` : '/reports/schedules')
      } else if (report.to) {
        navigate(report.to)
      }
      return
    }
    setOpenReport(report.id)
  }

  return (
    <div className="min-h-screen bg-section">
      <BillingBanner />
      <main className="mx-auto max-w-[1100px] px-4 py-8 sm:px-8">
        {openReport === 'board' ? (
          <>
            <button
              type="button"
              onClick={() => setOpenReport(null)}
              className="mb-5 inline-flex items-center gap-1.5 text-[15px] font-semibold text-muted transition-colors hover:text-gold"
            >
              <ArrowLeft size={15} /> All reports
            </button>
            <BoardReportWizard
              key={`board-${boardNonce}`}
              schoolId={activeSchool?.id ?? null}
              school={activeSchool}
              periods={periods || []}
              initialPeriodId={defaultPeriodId}
            />
          </>
        ) : openReport === 'monthly' ? (
          <>
            <button
              type="button"
              onClick={() => setOpenReport(null)}
              className="mb-5 inline-flex items-center gap-1.5 text-[15px] font-semibold text-muted transition-colors hover:text-gold"
            >
              <ArrowLeft size={15} /> All reports
            </button>
            <MonthlyActualsSection periods={periods || []} initialPeriodId={defaultPeriodId} />
          </>
        ) : openReport === 'forecast' ? (
          <>
            <button
              type="button"
              onClick={() => setOpenReport(null)}
              className="mb-5 inline-flex items-center gap-1.5 text-[15px] font-semibold text-muted transition-colors hover:text-gold"
            >
              <ArrowLeft size={15} /> All reports
            </button>
            <ForecastView
              key={`${activeSchool?.id}:${defaultPeriodId}`}
              schoolId={activeSchool?.id ?? null}
              periodId={defaultPeriodId}
            />
          </>
        ) : (
          renderHub(onSelect)
        )}
      </main>
    </div>
  )
}

// Render-helper (not a nested component def) for the report catalog grid.
function renderHub(onSelect) {
  return (
    <div key="hub">
      <motion.header
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-7"
      >
        <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-gold">Reports</p>
        <h1 className="mt-1 font-serif text-2xl font-semibold text-navy sm:text-3xl">Board &amp; finance reports</h1>
        <p className="mt-1.5 max-w-2xl text-[16px] text-muted">
          Assemble polished, board-ready packets straight from your saved statements and budget. No
          spreadsheets — pick a period, review the numbers, add your narrative, and print.
        </p>
      </motion.header>

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-3">
        {REPORTS.map((r, i) => {
          const Icon = r.Icon || FileBarChart2
          return (
          <motion.button
            key={r.id}
            id={r.id === 'board' ? 'reports-board-card' : undefined}
            type="button"
            disabled={!r.live}
            onClick={() => r.live && onSelect(r)}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i }}
            whileHover={r.live ? { y: -3 } : undefined}
            className={`group relative flex flex-col rounded-2xl border-2 p-3.5 text-left transition-all sm:p-5 ${
              r.live
                ? 'border-gold/30 bg-white shadow-card hover:border-gold/60 hover:shadow-glow'
                : 'cursor-not-allowed border-rule/60 bg-white/60 opacity-70'
            }`}
          >
            <span
              className={`mb-2.5 flex h-9 w-9 items-center justify-center rounded-xl sm:mb-3 sm:h-11 sm:w-11 ${
                r.live ? 'bg-gold/15 text-gold' : 'bg-navy/[0.06] text-muted'
              }`}
            >
              <Icon size={20} className="sm:hidden" />
              <Icon size={22} className="hidden sm:block" />
            </span>
            <h2 className="font-serif text-base font-bold text-navy sm:text-xl">{r.title}</h2>
            <p className="mt-1 flex-1 text-[12.5px] leading-relaxed text-muted sm:mt-1.5 sm:text-[15px]">
              {r.blurb}
            </p>
            <span
              id={r.id === 'board' ? 'reports-generate-button' : undefined}
              className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] sm:mt-4 sm:text-[14px]"
            >
              {r.live ? (
                <span className="inline-flex items-center gap-1.5 text-gold">
                  {r.action === 'navigate'
                    ? 'Open schedules'
                    : r.id === 'forecast'
                      ? 'View forecast'
                      : r.action === 'inline'
                        ? 'Manage months'
                        : 'Build report'}
                  <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-muted">
                  <Lock size={13} /> Coming soon
                </span>
              )}
            </span>
          </motion.button>
          )
        })}
      </div>
    </div>
  )
}
