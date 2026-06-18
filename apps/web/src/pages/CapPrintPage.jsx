// ─────────────────────────────────────────────────────────────────────────────
// Phase 2D — dedicated print/export route for the Corrective Action Plan. Lives
// inside AuthedLayout (so SchoolProvider + Billing context are available). Reads
// the period from ?period=, fetches the merged CAP, renders the clean
// CapPrintDocument, and auto-triggers window.print() once loaded. 402 -> friendly
// paused panel. Print CSS is scoped under the `cap-print` class in index.css.
// ─────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Printer } from 'lucide-react'
import { useSchools } from '../context/SchoolContext.jsx'
import { useCorrectiveActionPlan } from '../hooks/useCorrectiveActionPlan.js'
import CapPrintDocument from '../components/readiness/cap/CapPrintDocument.jsx'
import EntitlementPausedPanel from '../components/analytics/EntitlementPausedPanel.jsx'

export default function CapPrintPage() {
  const { activeSchool } = useSchools()
  const [params] = useSearchParams()
  const periodId = params.get('period') || null
  const schoolId = activeSchool?.id ?? null

  const { data, entries, loading, error, notEntitled } = useCorrectiveActionPlan(
    schoolId,
    periodId,
  )

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
        <p className="text-center text-[14px] text-muted">Preparing the corrective action plan…</p>
      ) : error ? (
        <p className="text-center text-[14px] text-red-600">{error}</p>
      ) : (
        <CapPrintDocument
          schoolName={activeSchool?.name}
          periodLabel={data?.label}
          rulesetVersion={data?.rulesetVersion}
          statuteYear={data?.statuteYear}
          entries={entries}
        />
      )}
    </div>
  )
}
