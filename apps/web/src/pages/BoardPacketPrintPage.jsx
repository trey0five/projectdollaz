// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 — dedicated print/export route for the Board / Finance-Committee packet.
// Lives inside AuthedLayout (SchoolProvider + Billing context available). Reads the
// period from ?period=, aggregates the dashboard insight + metrics + compliance /
// CAP / reconciliation status, renders the clean BoardPacketPrintDocument, and
// auto-triggers window.print() once everything has loaded. 402 -> paused panel.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { useSchools } from '../context/SchoolContext.jsx'
import { useAnalytics, useInsights } from '../hooks/useAnalytics.js'
import { useCompliance } from '../hooks/useCompliance.js'
import { useCorrectiveActionPlan } from '../hooks/useCorrectiveActionPlan.js'
import { useReconciliation } from '../hooks/useReconciliation.js'
import BoardPacketPrintDocument from '../components/reports/BoardPacketPrintDocument.jsx'
import EntitlementPausedPanel from '../components/analytics/EntitlementPausedPanel.jsx'
import BackLink from '../components/ui/BackLink.jsx'

export default function BoardPacketPrintPage() {
  const { activeSchool } = useSchools()
  const [params] = useSearchParams()
  const periodId = params.get('period') || null
  const schoolId = activeSchool?.id ?? null

  const { metrics, loading: aLoading, notEntitled: aPaused } = useAnalytics(schoolId, periodId)
  const { text: insightText, loading: iLoading } = useInsights(schoolId, periodId)
  const { summary: cSummary, sections: cSections, loading: cLoading } = useCompliance(
    schoolId,
    periodId,
  )
  const {
    data: capData,
    summary: capSummary,
    loading: capLoading,
  } = useCorrectiveActionPlan(schoolId, periodId)
  const { result: recon, loading: rLoading } = useReconciliation(schoolId, periodId)

  const ready = !aLoading && !iLoading && !cLoading && !capLoading && !rLoading

  // Auto-print once everything is ready (one-shot).
  const printed = useRef(false)
  useEffect(() => {
    if (!printed.current && ready && !aPaused) {
      printed.current = true
      const t = setTimeout(() => window.print(), 400)
      return () => clearTimeout(t)
    }
  }, [ready, aPaused])

  if (aPaused) {
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
        <BackLink />
        <button onClick={() => window.print()} className="btn-primary inline-flex items-center gap-2">
          <Printer size={15} /> Print / Save as PDF
        </button>
      </div>

      {!ready ? (
        <p className="text-center text-[14px] text-muted">Preparing the board packet…</p>
      ) : (
        <BoardPacketPrintDocument
          schoolName={activeSchool?.name}
          periodLabel={capData?.label}
          metrics={metrics}
          insightText={insightText}
          complianceSummary={cSummary}
          complianceSections={cSections}
          capSummary={capSummary}
          reconciliation={recon}
        />
      )}
    </div>
  )
}
