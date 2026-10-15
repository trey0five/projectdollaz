// Read-only tabbed report view used by the History page (Phase 1C). Renders the
// SAME four statement components fed a STORED snapshot bundle via ReportViewProvider
// (instead of the live intake-derived reports). No intake, no save — view + export.
import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
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
  const reduce = useReducedMotion()
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
      {/* Ink tabs on the ground (Premium UI P4): the statement axis, a 2px rule
          under the active statement. Scrolls inside its own wrapper on a phone. */}
      <div className="no-print scrollbar-none overflow-x-auto">
        <div role="tablist" aria-label="Statements" className="tabs-ink min-w-max">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className="tab-ink shrink-0"
            >
              <span className="whitespace-nowrap">{t.label}</span>
              {tab === t.key &&
                (reduce ? (
                  <span className="tab-ink-rule" aria-hidden="true" />
                ) : (
                  <motion.span layoutId="statements-tab-rule" className="tab-ink-rule" aria-hidden="true" />
                ))}
            </button>
          ))}
        </div>
      </div>

      <div className="pb-16 pt-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={reduce ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -8 }}
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
              className="group relative cursor-zoom-in rounded-[8px] outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/50"
            >
              <Active />
              <div className="pointer-events-none absolute right-3 top-3 flex items-center gap-1.5 rounded-[4px] border border-hair bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink2 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-visible:opacity-100">
                <Maximize2 size={12} aria-hidden="true" /> Tap to zoom
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>

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
