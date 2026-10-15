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
import { FileBarChart2, Landmark, Lock, CalendarClock, TrendingUp, Printer, FileText, ArrowRight } from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import { useSchools } from '../context/SchoolContext.jsx'
import { usePersistence } from '../context/PersistenceContext.jsx'
import BoardReportWizard from '../components/reports/board/BoardReportWizard.jsx'
import MonthlyActualsSection from '../components/monthly/MonthlyActualsSection.jsx'
import ForecastView from '../components/reports/ForecastView.jsx'
import BoardPacketExportButton from '../components/reports/BoardPacketExportButton.jsx'
import {
  AuroraButton,
  AuroraLightButton,
  AuroraSection,
  AuroraTile,
  AuroraTileGrid,
  HowThisWorks,
  VerdictEm,
  fyLabel,
} from '../components/ui/aurora/index.js'
import { FinanceSubPage, FinanceSubBand, FinanceMore } from '../components/statements/financeSub.jsx'
import { formatShortDate } from '../lib/format.js'
import { periodClosed } from '../components/finance/financeAurora.js'

// Catalog of report types. `blurb` is ONE short line (the long description
// lives in How this works); `cta` is the tile's action word.
const REPORTS = [
  {
    id: 'board',
    title: 'Board Report',
    blurb: 'Budget vs. actual, key numbers and your notes.',
    live: true,
    Icon: FileBarChart2,
    action: 'wizard',
    cta: 'Build report',
  },
  {
    id: 'forecast',
    title: 'FYE Forecast',
    // Deliberately does NOT name a destination: the FY-end forecast is entered
    // in Planning & Forecasting, which is a separately-licensed module, and a
    // default school (finance-only) would read this as an instruction it cannot
    // follow. ForecastView's own CTA is entitlement-aware and says the right
    // thing either way — that is the ONE place the destination is decided.
    blurb: 'Where the year is likely to land.',
    live: true,
    Icon: TrendingUp,
    action: 'inline',
    cta: 'View forecast',
  },
  {
    id: 'monthly',
    title: 'Monthly Actuals',
    blurb: 'Month-end numbers for year-to-date columns.',
    live: true,
    Icon: CalendarClock,
    action: 'inline',
    cta: 'Manage months',
  },
  {
    id: 'schedules',
    title: 'Supporting Schedules',
    blurb: 'Capital projects, cash and investments.',
    live: true,
    Icon: Landmark,
    action: 'navigate',
    cta: 'Open schedules',
  },
]

const OPEN_TITLE = { board: 'Board Report', monthly: 'Monthly Actuals', forecast: 'FYE Forecast' }

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

  const latest = snapshotPeriods[0] ?? null
  const back = () => setOpenReport(null)
  // An open report keeps the trail: Dashboard › Finance › Reports › <report>,
  // with "Reports" a real step back to the hub.
  const openCrumbs = openReport
    ? [
        { label: 'Dashboard', to: '/app' },
        { label: 'Finance', to: '/finance' },
        { label: 'Reports', onClick: back },
        { label: OPEN_TITLE[openReport] },
      ]
    : null

  return (
    <div className="min-h-screen">
      <BillingBanner />
      <main>
        {openReport === 'board' ? (
          <FinanceSubPage crumbs={openCrumbs}>
            <BoardReportWizard
              key={`board-${boardNonce}`}
              schoolId={activeSchool?.id ?? null}
              school={activeSchool}
              periods={periods || []}
              initialPeriodId={defaultPeriodId}
            />
            <FinanceMore current="reports" />
          </FinanceSubPage>
        ) : openReport === 'monthly' ? (
          <FinanceSubPage crumbs={openCrumbs}>
            <MonthlyActualsSection periods={periods || []} initialPeriodId={defaultPeriodId} />
            <FinanceMore current="reports" />
          </FinanceSubPage>
        ) : openReport === 'forecast' ? (
          <FinanceSubPage crumbs={openCrumbs}>
            <ForecastView
              key={`${activeSchool?.id}:${defaultPeriodId}`}
              schoolId={activeSchool?.id ?? null}
              periodId={defaultPeriodId}
            />
            <FinanceMore current="reports" />
          </FinanceSubPage>
        ) : (
          renderHub(onSelect, latest)
        )}
      </main>
    </div>
  )
}

// Render-helper (not a nested component def) for the report catalog: the
// Finance band (the main jobs as buttons) over the reports as Aurora tiles.
function renderHub(onSelect, latest) {
  const board = REPORTS.find((r) => r.id === 'board')
  const schedules = REPORTS.find((r) => r.id === 'schedules')
  const label = latest ? fyLabel(latest.label) : null
  const closed = latest ? periodClosed(latest.periodEndDate) : false
  return (
    <FinanceSubPage key="hub" crumb="Reports">
      <FinanceSubBand
        eyebrow={latest ? `Latest saved year · ${closed ? 'ended' : 'ends'} ${formatShortDate(latest.periodEndDate)}` : null}
        title="Reports"
        verdict={
          latest ? (
            <>
              Build a board packet from your <VerdictEm>{label}</VerdictEm> numbers.
            </>
          ) : (
            <>Save a year&rsquo;s numbers and your board packet builds from them.</>
          )
        }
        actions={
          <>
            <AuroraButton variant="primary" onClick={() => onSelect(board)} icon={<FileBarChart2 size={19} aria-hidden="true" />}>
              Build board report
            </AuroraButton>
            {latest ? <BoardPacketExportButton periodId={latest.id} /> : null}
            <AuroraButton onClick={() => onSelect(schedules)} icon={<Landmark size={19} aria-hidden="true" />}>
              Schedules
            </AuroraButton>
          </>
        }
      />

      <AuroraSection first icon={FileBarChart2} title="Your reports" subtitle="Pick one to open it" count={`${REPORTS.filter((r) => r.live).length} reports`}>
        <AuroraTileGrid cols={4}>
          {REPORTS.map((r, i) => {
            const Icon = r.Icon || FileBarChart2
            return (
              <AuroraTile
                key={r.id}
                id={r.id === 'board' ? 'reports-board-card' : undefined}
                icon={Icon}
                title={r.title}
                desc={r.blurb}
                hue={i % 3 === 1 ? 'var(--au-h2)' : i % 3 === 2 ? 'var(--au-h3)' : undefined}
                onClick={r.live ? () => onSelect(r) : null}
                ariaLabel={r.live ? `${r.title} — ${r.cta}` : undefined}
                aria-disabled={r.live ? undefined : 'true'}
                foot={
                  r.live ? (
                    <span id={r.id === 'board' ? 'reports-generate-button' : undefined} className="text-small font-semibold text-ink">
                      {r.cta}
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
        </AuroraTileGrid>
      </AuroraSection>

      <AuroraSection icon={Printer} title="Ready to print" subtitle="Open a print-ready document">
        <AuroraTileGrid cols={2}>
          <AuroraTile
            icon={FileText}
            title="Board packet"
            desc={label ? `Numbers, readiness and notes for ${label}.` : 'Numbers, readiness and notes for a saved year.'}
            foot={
              latest ? (
                <BoardPacketExportButton periodId={latest.id} />
              ) : (
                <span className="text-small text-ink2">Save a year&rsquo;s numbers first.</span>
              )
            }
          />
          <AuroraTile
            hue="var(--au-h2)"
            icon={Printer}
            title="Board report"
            desc={label ? `Print the yearly board report for ${label}.` : 'Print the board report you built.'}
            foot={
              latest ? (
                // The print route reads the year from ?period= (annual layout —
                // a monthly or quarterly packet prints from the wizard's last step).
                <AuroraLightButton
                  variant="ghost"
                  size="sm"
                  to={`/reports/board/print?period=${encodeURIComponent(latest.id)}`}
                >
                  Open <ArrowRight size={13} aria-hidden="true" />
                </AuroraLightButton>
              ) : (
                <span className="text-small text-ink2">Save a year&rsquo;s numbers first.</span>
              )
            }
          />
        </AuroraTileGrid>
      </AuroraSection>

      <FinanceMore current="reports" />

      <HowThisWorks>
        <p>Reports are built from your saved statements and budget — no spreadsheets.</p>
        <p>
          The Board Report is a branded finance-committee packet: budget vs. actual, key indicators, your MD&amp;A
          notes and the three core statements, ready to print or save as PDF.
        </p>
        <p>The FYE Forecast and Supporting Schedules flow into the board packet once saved.</p>
        <p>Monthly actuals build year-to-date columns from month-end trial balances.</p>
      </HowThisWorks>
    </FinanceSubPage>
  )
}
