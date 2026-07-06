// Read-only tabbed report view used by the History page (Phase 1C). Renders the
// SAME four statement components fed a STORED snapshot bundle via ReportViewProvider
// (instead of the live intake-derived reports). No intake, no save — view + export.
import { useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Maximize2 } from 'lucide-react'
import { ReportViewProvider } from '../../context/AppContext.jsx'
import { importsApi } from '../../lib/api.js'
import ReportExpandOverlay from './ReportExpandOverlay.jsx'
import LineageHost from './LineageHost.jsx'
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

export default function ReportTabs({ bundle, school, periodId = null, dateLabel = '', periodLabel = '' }) {
  const [tab, setTab] = useState('soa')
  // Period import summaries power the drill-down drawer's "Source" section. Read
  // -only, any-active-member; tolerates failure (the Source section degrades).
  // All setState runs in async callbacks (await-before-setState pattern) so no
  // state is set synchronously inside the effect body.
  const [imports, setImports] = useState(null)
  const schoolId = school?.id ?? null
  useEffect(() => {
    let cancelled = false
    if (!schoolId || !periodId) {
      Promise.resolve().then(() => {
        if (!cancelled) setImports(null)
      })
      return () => {
        cancelled = true
      }
    }
    importsApi
      .listForPeriod(schoolId, periodId)
      .then((res) => {
        if (!cancelled) setImports(res.data)
      })
      .catch(() => {
        if (!cancelled) setImports([])
      })
    return () => {
      cancelled = true
    }
  }, [schoolId, periodId])
  // Tap/click a statement to open the full-screen pinch-zoom view. This lived in
  // the old Dashboard and was lost when /statements went read-only — restored here
  // so it works everywhere ReportTabs renders (and finally on mobile, where the
  // inline report is too small to read).
  const [expanded, setExpanded] = useState(false)
  const activeTab = TABS.find((t) => t.key === tab)
  const Active = activeTab.Component

  if (!bundle) return null

  return (
    <ReportViewProvider bundle={bundle} school={school} dateLabel={dateLabel} periodLabel={periodLabel}>
      <LineageHost bundle={bundle} imports={imports} schoolId={schoolId} periodId={periodId}>
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
              <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-full bg-navy/85 px-3 py-1.5 text-[12px] font-semibold uppercase tracking-wide text-white shadow-lift transition-opacity sm:opacity-0 sm:group-hover:opacity-100">
                <Maximize2 size={12} /> Tap to zoom
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Full-screen pinch-zoom view of the active statement (no-print). */}
      <ReportExpandOverlay
        open={expanded}
        title={activeTab.label}
        onClose={() => setExpanded(false)}
      >
        <Active />
      </ReportExpandOverlay>
      </LineageHost>
    </ReportViewProvider>
  )
}
