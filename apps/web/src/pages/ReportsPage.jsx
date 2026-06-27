// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — Reports hub. The /reports landing surface. Phase 1 lists ONE report
// type ("Board Report" — the NBOA-style finance-committee packet); the layout is
// built so more report types slot in later as additional cards. Selecting the
// Board Report opens the 5-step BoardReportWizard inline, with the period
// preselected to the live (newest snapshot) period. Navy/gold theme, framer-motion
// polish. Distinct from the compliance "board packet" (/board-packet/print).
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { FileBarChart2, ArrowRight, ArrowLeft, Lock } from 'lucide-react'
import TopBar from '../components/TopBar.jsx'
import BillingBanner from '../components/BillingBanner.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { usePersistence } from '../context/PersistenceContext.jsx'
import BoardReportWizard from '../components/reports/board/BoardReportWizard.jsx'

// Catalog of report types. Phase 1 ships only the Board Report live; the rest are
// listed as "coming soon" placeholders so the IA reads as a growing hub.
const REPORTS = [
  {
    id: 'board',
    title: 'Board Report',
    blurb:
      'A branded finance-committee packet: budget vs. actual, key indicators, MD&A narrative, and the three core statements — ready to print or save as PDF.',
    live: true,
  },
  {
    id: 'forecast',
    title: 'FYE Forecast',
    blurb: 'Project the full fiscal year from year-to-date actuals.',
    live: false,
  },
  {
    id: 'capital',
    title: 'Capital Budget Summary',
    blurb: 'Capital projects, funding sources, and reserve impact.',
    live: false,
  },
]

export default function ReportsPage() {
  const { activeSchool } = useSchools()
  const { periods } = usePersistence()
  const [openReport, setOpenReport] = useState(null)

  // Preselect the newest period that actually has a snapshot (the "live" period).
  const snapshotPeriods = useMemo(
    () => (periods || []).filter((p) => p.hasSnapshot),
    [periods],
  )
  const defaultPeriodId = snapshotPeriods[0]?.id ?? (periods || [])[0]?.id ?? null

  return (
    <div className="min-h-screen bg-section">
      <TopBar />
      <BillingBanner />
      <main className="mx-auto max-w-[1100px] px-4 py-8 sm:px-8">
        {openReport === 'board' ? (
          <>
            <button
              type="button"
              onClick={() => setOpenReport(null)}
              className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted transition-colors hover:text-gold"
            >
              <ArrowLeft size={15} /> All reports
            </button>
            <BoardReportWizard
              schoolId={activeSchool?.id ?? null}
              school={activeSchool}
              periods={periods || []}
              initialPeriodId={defaultPeriodId}
            />
          </>
        ) : (
          renderHub(setOpenReport)
        )}
      </main>
    </div>
  )
}

// Render-helper (not a nested component def) for the report catalog grid.
function renderHub(setOpenReport) {
  return (
    <div key="hub">
      <motion.header
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-7"
      >
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-gold">Reports</p>
        <h1 className="mt-1 font-serif text-3xl font-semibold text-navy">Board &amp; finance reports</h1>
        <p className="mt-1.5 max-w-2xl text-[14px] text-muted">
          Assemble polished, board-ready packets straight from your saved statements and budget. No
          spreadsheets — pick a period, review the numbers, add your narrative, and print.
        </p>
      </motion.header>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {REPORTS.map((r, i) => (
          <motion.button
            key={r.id}
            type="button"
            disabled={!r.live}
            onClick={() => r.live && setOpenReport(r.id)}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * i }}
            whileHover={r.live ? { y: -3 } : undefined}
            className={`group relative flex flex-col rounded-2xl border-2 p-5 text-left transition-all ${
              r.live
                ? 'border-gold/30 bg-white shadow-card hover:border-gold/60 hover:shadow-glow'
                : 'cursor-not-allowed border-rule/60 bg-white/60 opacity-70'
            }`}
          >
            <span
              className={`mb-3 flex h-11 w-11 items-center justify-center rounded-xl ${
                r.live ? 'bg-gold/15 text-gold' : 'bg-navy/[0.06] text-muted'
              }`}
            >
              <FileBarChart2 size={22} />
            </span>
            <h2 className="font-serif text-lg font-semibold text-navy">{r.title}</h2>
            <p className="mt-1.5 flex-1 text-[13px] leading-relaxed text-muted">{r.blurb}</p>
            <span className="mt-4 inline-flex items-center gap-1.5 text-[12px] font-semibold uppercase tracking-[0.08em]">
              {r.live ? (
                <span className="inline-flex items-center gap-1.5 text-gold">
                  Build report
                  <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-muted">
                  <Lock size={13} /> Coming soon
                </span>
              )}
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  )
}
