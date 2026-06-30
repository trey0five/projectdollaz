import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FileText, Maximize2 } from 'lucide-react'
import { useApp } from '../context/AppContext.jsx'
import IntakeBar from './IntakeBar.jsx'
import MappingPanel from './MappingPanel.jsx'
import OpeningBalances from './OpeningBalances.jsx'
import ValidationBanner from './ValidationBanner.jsx'
import StatementOfActivities from './reports/StatementOfActivities.jsx'
import StatementOfFinancialPosition from './reports/StatementOfFinancialPosition.jsx'
import StatementOfCashFlows from './reports/StatementOfCashFlows.jsx'
import StatementOfNetAssets from './reports/StatementOfNetAssets.jsx'
import ReportExpandOverlay from './reports/ReportExpandOverlay.jsx'
import ReportPicker from './reports/ReportPicker.jsx'
import LineageHost from './reports/LineageHost.jsx'

const TABS = [
  { key: 'soa', label: 'Statement of Activities', short: 'Activities', Component: StatementOfActivities },
  { key: 'sfp', label: 'Statement of Financial Position', short: 'Financial Position', Component: StatementOfFinancialPosition },
  { key: 'scf', label: 'Statement of Cash Flows', short: 'Cash Flows', Component: StatementOfCashFlows },
  { key: 'na', label: 'Net Assets', short: 'Net Assets', Component: StatementOfNetAssets },
]

export default function Dashboard() {
  const { reports } = useApp()
  const [tab, setTab] = useState('soa')
  const [expanded, setExpanded] = useState(false)

  // Land on the Activities tab whenever a fresh set of reports is generated.
  // Adjusting state during render (per React docs) avoids a cascading effect.
  const [prevReports, setPrevReports] = useState(reports)
  if (reports !== prevReports) {
    setPrevReports(reports)
    setTab('soa')
  }

  const activeTab = TABS.find((t) => t.key === tab)
  const Active = activeTab.Component

  return (
    <div>
      <IntakeBar />

      {/* Desktop tab bar — segmented tabs with the animated gold underline.
          (On mobile the statement switcher is a dropdown placed directly above
          the document preview below, so this bar is desktop-only. Full-screen
          zoom is available by tapping a statement.) */}
      <div className="no-print hidden border-b-2 border-rule bg-white sm:block">
        <div className="mx-auto flex w-full max-w-[1120px] items-stretch px-4 sm:px-10">
        <nav className="scrollbar-none flex flex-1 items-stretch justify-center gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative -mb-0.5 shrink-0 whitespace-nowrap rounded-t-lg px-3.5 py-4 text-[15px] font-semibold uppercase tracking-wide transition-colors ${
                tab === t.key ? 'text-navy' : 'text-muted hover:bg-section/60 hover:text-navy'
              }`}
            >
              {t.short}
              {tab === t.key && (
                <motion.span
                  layoutId="tab-underline"
                  className="absolute inset-x-0 -bottom-0.5 h-[4px] rounded-full bg-gold-gradient"
                />
              )}
            </button>
          ))}
        </nav>
        </div>
      </div>

      <LineageHost bundle={reports} imports={null}>
      {/* report container */}
      <main id="report-container" className="mx-auto max-w-[1120px] px-4 pb-20 pt-8 sm:px-10 sm:pb-24 sm:pt-10">
        {!reports ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex min-h-[55vh] flex-col items-center justify-center gap-5 text-center"
          >
            <motion.span
              className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gold-gradient text-white shadow-glow"
              animate={{ y: [0, -10, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            >
              <FileText size={34} />
            </motion.span>
            <p className="max-w-md font-serif text-lg italic text-muted sm:text-xl">
              Drop your Current-Year trial balance to preview the financial statements.
            </p>
          </motion.div>
        ) : (
          <>
            <ValidationBanner validation={reports.validation} />
            <OpeningBalances />
            <MappingPanel unmapped={reports.unmapped} />
            {/* mobile: statement switcher sits directly above the document preview.
                No overflow-hidden (it would clip the dropdown menu); relative z-20
                keeps the open menu above the statement preview below. */}
            <div className="relative z-20 mb-4 rounded-xl border-2 border-rule bg-white shadow-card sm:hidden">
              <ReportPicker tabs={TABS} value={tab} onChange={setTab} />
            </div>
            <AnimatePresence mode="wait">
              <motion.div
                key={tab}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                {/* Tap/click the report to open the full-screen zoomable view. */}
                <div
                  role="button"
                  tabIndex={0}
                  aria-label={`Open ${activeTab.label} full screen`}
                  onClick={() => setExpanded(true)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      setExpanded(true)
                    }
                  }}
                  className="group relative cursor-zoom-in rounded-2xl outline-none ring-gold/50 focus-visible:ring-2"
                >
                  <Active />
                  <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-navy/85 px-3 py-1.5 text-[13px] font-semibold uppercase tracking-wide text-white shadow-lift transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                    <Maximize2 size={12} /> Tap to zoom
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </>
        )}
      </main>

      {/* Full-screen expand: renders the SAME active statement, readable on
          phones and desktop. no-print so window.print() still prints the page. */}
      <ReportExpandOverlay
        open={expanded && !!reports}
        title={activeTab.label}
        onClose={() => setExpanded(false)}
      >
        {reports && <Active />}
      </ReportExpandOverlay>
      </LineageHost>
    </div>
  )
}
