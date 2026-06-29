// ─────────────────────────────────────────────────────────────────────────────
// Phase 1 — dedicated print/export route for the NBOA-style Board Report. Lives
// inside AuthedLayout (SchoolProvider + Billing context available). Reads the
// period from ?period=, fetches the fully-computed BoardReportBundle via
// useBoardReport (the web does ZERO math), renders the presentational
// BoardReportPrintDocument, and auto-fires window.print() once data is ready.
// 402 -> paused panel. DISTINCT from /board-packet/print (compliance packet).
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { useSchools } from '../context/SchoolContext.jsx'
import { useBoardReport } from '../hooks/useBoardReport.js'
import BoardReportPrintDocument from '../components/reports/BoardReportPrintDocument.jsx'
import EntitlementPausedPanel from '../components/analytics/EntitlementPausedPanel.jsx'

export default function BoardReportPrintPage() {
  const { activeSchool } = useSchools()
  const [params] = useSearchParams()
  const periodId = params.get('period') || null
  // Honor the granularity (+ month/quarter) the wizard navigated with, so the
  // printed packet matches the preview (annual / monthly MTD+YTD / quarterly QTD+YTD).
  const granularity = params.get('granularity') || 'annual'
  const monthKey = params.get('month') || null
  const quarter = params.get('quarter') || null
  const schoolId = activeSchool?.id ?? null

  const { data, loading, notEntitled } = useBoardReport(
    schoolId,
    periodId,
    granularity,
    monthKey,
    quarter,
  )
  const ready = !loading && !!data

  // Auto-print once data is ready (one-shot).
  const printed = useRef(false)
  useEffect(() => {
    if (!printed.current && ready && !notEntitled) {
      printed.current = true
      const t = setTimeout(() => window.print(), 400)
      return () => clearTimeout(t)
    }
  }, [ready, notEntitled])

  if (notEntitled) {
    return (
      <div className="mx-auto max-w-[900px] px-4 py-8">
        <EntitlementPausedPanel />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-[900px] px-4 py-8">
      {/* Screen-only toolbar (hidden in print). */}
      <div className="no-print mb-6 flex items-center justify-between">
        <Link
          to="/reports"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted transition-colors hover:text-gold"
        >
          <ArrowLeft size={15} /> Back to reports
        </Link>
        <button onClick={() => window.print()} className="btn-primary inline-flex items-center gap-2">
          <Printer size={15} /> Print / Save as PDF
        </button>
      </div>

      {!ready ? (
        <p className="text-center text-[14px] text-muted">Preparing the board report…</p>
      ) : (
        <BoardReportPrintDocument data={data} />
      )}
    </div>
  )
}
