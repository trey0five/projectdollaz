// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — Reports hub. The /reports landing surface. Phase 1 lists ONE report
// type ("Board Report" — the NBOA-style finance-committee packet); the layout is
// built so more report types slot in later as additional Tiles. Selecting the
// Board Report opens the 5-step BoardReportWizard inline, with the period
// preselected to the live (newest snapshot) period. Premium UI P4: PageHeader on
// a hairline + the report catalog as `Tile`s (the one card family that stays —
// a hub of choices), one-shot page stagger. Distinct from the compliance "board
// packet" (/board-packet/print).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileBarChart2, Landmark, ArrowLeft, Lock, CalendarClock, TrendingUp } from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import BackLink from '../components/ui/BackLink.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { usePersistence } from '../context/PersistenceContext.jsx'
import BoardReportWizard from '../components/reports/board/BoardReportWizard.jsx'
import MonthlyActualsSection from '../components/monthly/MonthlyActualsSection.jsx'
import ForecastView from '../components/reports/ForecastView.jsx'
import { Page, PageHeader, Section, Tile } from '../components/ui/surface/index.js'

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
    // Deliberately does NOT name a destination: the FY-end forecast is entered
    // in Planning & Forecasting, which is a separately-licensed module, and a
    // default school (finance-only) would read this as an instruction it cannot
    // follow. ForecastView's own CTA is entitlement-aware and says the right
    // thing either way — that is the ONE place the destination is decided.
    blurb:
      'Project where the year lands — driver assumptions, cohort roll-forward, and feeder enrollment. The saved forecast flows into your board packet.',
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
    <div className="min-h-screen">
      <BillingBanner />
      <main className="mx-auto max-w-page px-4 py-6 sm:px-10">
        {openReport === 'board' ? (
          <>
            <button type="button" onClick={() => setOpenReport(null)} className="back-link mb-2">
              <ArrowLeft size={15} aria-hidden="true" /> All reports
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
            <button type="button" onClick={() => setOpenReport(null)} className="back-link mb-2">
              <ArrowLeft size={15} aria-hidden="true" /> All reports
            </button>
            <MonthlyActualsSection periods={periods || []} initialPeriodId={defaultPeriodId} />
          </>
        ) : openReport === 'forecast' ? (
          <>
            <button type="button" onClick={() => setOpenReport(null)} className="back-link mb-2">
              <ArrowLeft size={15} aria-hidden="true" /> All reports
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

// Render-helper (not a nested component def) for the report catalog. The hub
// IS a set of choices, so each report is a `Tile` (hairline, 2px hue rule, the
// one-shot flood + arrow on hover); the page staggers in once.
function renderHub(onSelect) {
  return (
    <Page key="hub" as="div" className="!max-w-none !px-0">
      <BackLink className="mb-2" />
      <PageHeader
        eyebrow="Finance · Reports"
        title="Board & finance reports"
        meta="Assemble polished, board-ready packets straight from your saved statements and budget. No spreadsheets — pick a period, review the numbers, add your narrative, and print."
        hue="37 99 235"
      />
      <Section label="Reports">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {REPORTS.map((r) => {
            const Icon = r.Icon || FileBarChart2
            const cta =
              r.action === 'navigate'
                ? 'Open schedules'
                : r.id === 'forecast'
                  ? 'View forecast'
                  : r.action === 'inline'
                    ? 'Manage months'
                    : 'Build report'
            return (
              <Tile
                key={r.id}
                id={r.id === 'board' ? 'reports-board-card' : undefined}
                icon={<Icon size={22} aria-hidden="true" />}
                title={r.title}
                body={r.blurb}
                hue="37 99 235"
                locked={!r.live}
                arrow={r.live}
                // A locked tile is a plain <div> (Tile has no `disabled`), where an
                // aria-label is ignored — its visible title + "Coming soon" carry
                // the name; aria-disabled marks it unavailable.
                aria-label={r.live ? `${r.title} — ${cta}` : undefined}
                aria-disabled={r.live ? undefined : 'true'}
                onClick={r.live ? () => onSelect(r) : undefined}
                foot={
                  r.live ? (
                    <span
                      id={r.id === 'board' ? 'reports-generate-button' : undefined}
                      className="text-small font-semibold text-ink"
                    >
                      {cta}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-small text-ink2">
                      <Lock size={12} aria-hidden="true" /> Coming soon
                    </span>
                  )
                }
              />
            )
          })}
        </div>
      </Section>
    </Page>
  )
}
