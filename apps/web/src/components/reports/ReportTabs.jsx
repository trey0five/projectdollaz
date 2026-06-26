// Read-only tabbed report view used by the History page (Phase 1C). Renders the
// SAME four statement components fed a STORED snapshot bundle via ReportViewProvider
// (instead of the live intake-derived reports). No intake, no save — view + export.
import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ReportViewProvider } from '../../context/AppContext.jsx'
import StatementOfActivities from './StatementOfActivities.jsx'
import StatementOfFinancialPosition from './StatementOfFinancialPosition.jsx'
import StatementOfCashFlows from './StatementOfCashFlows.jsx'
import StatementOfNetAssets from './StatementOfNetAssets.jsx'

const TABS = [
  { key: 'soa', label: 'Statement of Activities', Component: StatementOfActivities },
  { key: 'sfp', label: 'Statement of Financial Position', Component: StatementOfFinancialPosition },
  { key: 'scf', label: 'Statement of Cash Flows', Component: StatementOfCashFlows },
  { key: 'na', label: 'Net Assets', Component: StatementOfNetAssets },
]

export default function ReportTabs({ bundle, school, dateLabel = '', periodLabel = '' }) {
  const [tab, setTab] = useState('soa')
  const activeTab = TABS.find((t) => t.key === tab)
  const Active = activeTab.Component

  if (!bundle) return null

  return (
    <ReportViewProvider bundle={bundle} school={school} dateLabel={dateLabel} periodLabel={periodLabel}>
      <div className="no-print border-b-2 border-rule bg-white">
        <nav className="scrollbar-none mx-auto flex w-full max-w-[1120px] items-stretch justify-center overflow-x-auto sm:px-10">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`relative -mb-0.5 shrink-0 whitespace-nowrap rounded-t-lg px-3 py-4 text-[13px] font-semibold uppercase tracking-wide transition-colors ${
                tab === t.key ? 'text-navy' : 'text-muted hover:bg-section/60 hover:text-navy'
              }`}
            >
              {t.label}
              {tab === t.key && (
                <motion.span
                  layoutId="history-tab-underline"
                  className="absolute inset-x-0 -bottom-0.5 h-[4px] rounded-full bg-gold-gradient"
                />
              )}
            </button>
          ))}
        </nav>
      </div>

      <main className="mx-auto max-w-[1120px] px-4 pb-20 pt-8 sm:px-10 sm:pb-24 sm:pt-10">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <Active />
          </motion.div>
        </AnimatePresence>
      </main>
    </ReportViewProvider>
  )
}
