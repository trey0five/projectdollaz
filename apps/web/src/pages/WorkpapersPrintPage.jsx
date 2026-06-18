// ─────────────────────────────────────────────────────────────────────────────
// Phase 2C — dedicated print/export route for the Year-End Workpapers Packet.
// Lives inside AuthedLayout (so SchoolProvider + Billing context are available).
// Reads the period from ?period=, fetches the aggregated packet, renders the clean
// WorkpapersPrintDocument, and auto-triggers window.print() once loaded. 402 ->
// friendly paused panel. Print CSS is scoped under the `.packet-print` class.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { useSchools } from '../context/SchoolContext.jsx'
import { useWorkpapers } from '../hooks/useWorkpapers.js'
import WorkpapersPrintDocument from '../components/readiness/workpapers/WorkpapersPrintDocument.jsx'
import EntitlementPausedPanel from '../components/analytics/EntitlementPausedPanel.jsx'

export default function WorkpapersPrintPage() {
  const { activeSchool } = useSchools()
  const [params] = useSearchParams()
  const periodId = params.get('period') || null
  const schoolId = activeSchool?.id ?? null

  const { data, loading, error, notEntitled } = useWorkpapers(schoolId, periodId)

  // Auto-print once the document is ready (one-shot).
  const printed = useRef(false)
  useEffect(() => {
    if (!printed.current && !loading && data && !notEntitled) {
      printed.current = true
      const t = setTimeout(() => window.print(), 350)
      return () => clearTimeout(t)
    }
  }, [loading, data, notEntitled])

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
          to="/readiness"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-muted transition-colors hover:text-gold"
        >
          <ArrowLeft size={15} /> Back to Review Readiness
        </Link>
        <button onClick={() => window.print()} className="btn-primary inline-flex items-center gap-2">
          <Printer size={15} /> Print / Save as PDF
        </button>
      </div>

      {loading ? (
        <p className="text-center text-[14px] text-muted">Preparing the workpapers packet…</p>
      ) : error ? (
        <p className="text-center text-[14px] text-red-600">{error}</p>
      ) : (
        <WorkpapersPrintDocument packet={data} />
      )}
    </div>
  )
}
