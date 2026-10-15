// ─────────────────────────────────────────────────────────────────────────────
// DiocesanImportPage — the ORG-level "one file for every school" enrollment
// import. Two steps, durable staging in between (resume on reload via ?importId):
//   1) Upload a diocesan enrollment file (admissions dashboard OR the grade ×
//      demographic detail matrix). The server parses it, name-matches every row
//      to a school, and returns a review payload we persist as a staging batch.
//   2) Review: high-confidence rows auto-apply; ambiguous / unmatched rows get an
//      inline school picker (+ skip, + learn-alias). "Confirm & apply" fans the
//      matched rows into the existing per-school snapshot+promote pipeline —
//      connected data supersedes manual (reversible). An apply summary follows.
// Org-scoped (uses useScope().orgId). Owner/accountant permission + 'enrollment'
// entitlement are enforced per-school INSIDE the apply service (un-permitted /
// un-entitled schools come back `skipped`, never blocking the batch).
// Navy/gold theme; the review table scrolls in its own overflow-x container.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  GraduationCap,
  UploadCloud,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Trash2,
  ArrowRight,
} from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import BackLink from '../components/ui/BackLink.jsx'
import DatePicker from '../components/ui/DatePicker.jsx'
import { PageHeader, StatStrip, Stat, Pill, DataTable } from '../components/ui/surface/index.js'
import '../styles/pending/b2-finance.css'
import DiocesanReviewTable from '../components/enrollment/DiocesanReviewTable.jsx'
import { useScope } from '../context/ScopeContext.jsx'
import { diocesanEnrollmentApi, apiErrorMessage } from '../lib/api.js'

// Build the initial per-row decision map from a review payload. High-confidence
// (exact/alias/high) rows are pre-matched (auto). Review/unmatched rows start
// UNCONFIRMED (no school) so the reviewer must actively pick — never mis-route.
function initDecisions(rows = []) {
  const out = {}
  for (const r of rows) {
    if (r.decision === 'applied') {
      out[r.rowId] = { action: 'match', schoolId: r.match?.schoolId ?? null, learnAlias: false, auto: true }
    } else if (r.decision === 'auto' || r.tier === 'high' || r.tier === 'alias' || r.tier === 'exact') {
      out[r.rowId] = { action: 'match', schoolId: r.match?.schoolId ?? null, learnAlias: false, auto: true }
    } else if (r.decision === 'skipped') {
      out[r.rowId] = { action: 'skip', schoolId: null, learnAlias: true, auto: false }
    } else {
      // review / unmatched → the reviewer must confirm a school (or skip).
      out[r.rowId] = { action: 'unmatch', schoolId: null, learnAlias: true, auto: false }
    }
  }
  return out
}

export default function DiocesanImportPage() {
  const { orgId, orgResolved, isMultiSchool } = useScope()
  const [params, setParams] = useSearchParams()
  const importId = params.get('importId') || null

  const [payload, setPayload] = useState(null)
  const [decisions, setDecisions] = useState({})
  const [observedOn, setObservedOn] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [applying, setApplying] = useState(false)
  const [result, setResult] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef(null)

  const applied = payload?.status === 'applied' || !!result

  // Resume a staging batch from ?importId (durable — survives reload / return).
  useEffect(() => {
    if (!orgId || !importId || payload) return undefined
    let cancelled = false
    // Microtask-deferred so we never setState synchronously inside the effect body.
    Promise.resolve()
      .then(() => {
        if (cancelled) return null
        setLoading(true)
        return diocesanEnrollmentApi.getImport(orgId, importId)
      })
      .then((res) => {
        if (cancelled || !res) return
        const p = res.data ?? res
        setPayload(p)
        setDecisions(initDecisions(p.rows))
        setObservedOn(p.observedOn || '')
      })
      .catch((e) => {
        if (!cancelled) setError(apiErrorMessage(e, 'Could not load this import.'))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [orgId, importId, payload])

  const applyPayload = useCallback((p) => {
    setPayload(p)
    setDecisions(initDecisions(p.rows))
    setObservedOn(p.observedOn || '')
  }, [])

  const doUpload = useCallback(
    async (file) => {
      if (!orgId || !file) return
      setLoading(true)
      setError('')
      try {
        const form = new FormData()
        form.append('file', file)
        if (observedOn) form.append('observedOn', observedOn)
        const res = await diocesanEnrollmentApi.upload(orgId, form)
        const p = res.data ?? res
        applyPayload(p)
        if (p.importId) setParams({ importId: p.importId }, { replace: true })
      } catch (e) {
        setError(apiErrorMessage(e, 'We could not read that file. Check the format and try again.'))
      } finally {
        setLoading(false)
      }
    },
    [orgId, observedOn, applyPayload, setParams],
  )

  // Persist a single row override (durable) + update local state.
  const onRowChange = useCallback(
    (rowId, partial) => {
      setDecisions((prev) => {
        const next = { ...prev, [rowId]: { ...prev[rowId], ...partial } }
        const d = next[rowId]
        if (orgId && importId) {
          const body = { action: d.action }
          if (d.action === 'match' && d.schoolId) {
            body.schoolId = d.schoolId
            body.learnAlias = d.learnAlias ?? true
          }
          // Fire-and-forget persistence; local state is the source of truth for UI.
          diocesanEnrollmentApi.patchRow(orgId, importId, rowId, body).catch(() => {})
        }
        return next
      })
    },
    [orgId, importId],
  )

  const counts = useMemo(() => {
    const rows = payload?.rows || []
    let matched = 0
    let review = 0
    let skipped = 0
    for (const r of rows) {
      const d = decisions[r.rowId] || {}
      if (d.action === 'skip') skipped += 1
      else if (d.action === 'match' && d.schoolId) matched += 1
      else review += 1
    }
    return { matched, review, skipped, total: rows.length }
  }, [payload, decisions])

  const doApply = useCallback(async () => {
    if (!orgId || !importId) return
    setApplying(true)
    setError('')
    try {
      const body = observedOn ? { observedOn } : {}
      const res = await diocesanEnrollmentApi.apply(orgId, importId, body)
      setResult(res.data ?? res)
    } catch (e) {
      setError(apiErrorMessage(e, 'Apply failed. Your review was saved — try again.'))
    } finally {
      setApplying(false)
    }
  }, [orgId, importId, observedOn])

  const doDiscard = useCallback(async () => {
    if (!orgId || !importId) return
    try {
      await diocesanEnrollmentApi.discard(orgId, importId)
    } catch {
      /* best-effort */
    }
    setPayload(null)
    setDecisions({})
    setResult(null)
    setParams({}, { replace: true })
  }, [orgId, importId, setParams])

  const startOver = useCallback(() => {
    setPayload(null)
    setDecisions({})
    setResult(null)
    setError('')
    setParams({}, { replace: true })
  }, [setParams])

  // ── Gates ──────────────────────────────────────────────────────────────────
  if (orgResolved && !isMultiSchool) {
    return (
      <div className="min-h-screen">
        <BillingBanner />
        <div className="mx-auto max-w-page px-4 py-6 sm:px-10">
          <BackLink className="mb-2" />
          <PageHeader eyebrow="Enrollment · Diocesan import" title="One file, every school" hue="37 99 235" />
          <div className="b2-note mt-8 flex flex-col items-center gap-2">
            <GraduationCap size={24} aria-hidden="true" className="text-ink2" />
            <h2 className="b2-note-title">This is a diocese-wide import</h2>
            <p className="max-w-md">
              Upload one enrollment file for every school in your organization. It&apos;s available for
              multi-school organizations — add more schools to use it, or import each school&apos;s roster
              from its Enrollment page.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <BillingBanner />
      <div className="mx-auto max-w-page px-4 py-6 sm:px-10">
        <BackLink className="mb-2" />
        <PageHeader
          eyebrow="Enrollment · Diocesan import"
          title="One file, every school"
          meta="Upload one enrollment file for every school in your organization; review each match before it is applied."
          hue="37 99 235"
        />
        <div className="mt-6" />

        {error && (
          <div className="b2-callout b2-risk mb-5" role="alert">
            <AlertTriangle size={14} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {/* ── APPLY RESULT ── */}
        {result ? (
          <ApplyResult result={result} onStartOver={startOver} />
        ) : payload ? (
          // ── REVIEW STEP ──
          <div className="space-y-5 pb-28">
            <StatStrip cols={4} className="stats-compact">
              <Stat label="Rows" value={counts.total} />
              <Stat label="Ready" value={counts.matched} status={counts.matched ? 'good' : undefined} />
              <Stat label="Need review" value={counts.review} status={counts.review ? 'watch' : undefined} />
              <Stat label="Skipped" value={counts.skipped} />
            </StatStrip>
            <div className="flex flex-wrap items-end justify-end gap-3">
              <label className="block">
                <span className="b2-label">As of date</span>
                <DatePicker
                  value={observedOn}
                  onChange={setObservedOn}
                  disabled={applied}
                  className="b2-input w-44 font-semibold"
                />
              </label>
              <button type="button" onClick={doDiscard} className="btn btn-quiet">
                <Trash2 size={14} aria-hidden="true" /> Discard
              </button>
            </div>

            {payload.fileName && (
              <p className="flex items-center gap-1.5 text-[13px] text-ink2">
                <FileSpreadsheet size={14} /> {payload.fileName}
                {payload.sourceShape ? (
                  <Pill className="ml-1 capitalize">{payload.sourceShape}</Pill>
                ) : null}
              </p>
            )}

            {Array.isArray(payload.warnings) && payload.warnings.length > 0 && (
              <ul className="b2-callout b2-watch flex-col !gap-1">
                {payload.warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[13px] text-ink">
                    <AlertTriangle size={13} aria-hidden="true" className="mt-0.5 shrink-0 text-ink2" /> {w}
                  </li>
                ))}
              </ul>
            )}

            <DiocesanReviewTable
              rows={payload.rows || []}
              schoolOptions={payload.schoolOptions || []}
              decisions={decisions}
              onRowChange={onRowChange}
              applied={applied}
            />

            {/* Sticky confirm-and-apply bar. */}
            {!applied && (
              <div className="fixed inset-x-0 bottom-0 z-40 border-t border-hair bg-white shadow-float lg:left-64">
                <div className="mx-auto flex max-w-page items-center justify-between gap-4 px-4 py-3.5 sm:px-10">
                  <p className="text-[14px] text-ink2">
                    <b className="text-ink">{counts.matched}</b> school{counts.matched === 1 ? '' : 's'} ready
                    {counts.review > 0 && (
                      <span className="text-ink"> · {counts.review} still need a match</span>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={doApply}
                    disabled={applying || counts.matched === 0}
                    className="btn btn-primary"
                  >
                    {applying ? (
                      <>
                        <Loader2 size={16} className="animate-spin" /> Applying…
                      </>
                    ) : (
                      <>
                        Confirm &amp; apply {counts.matched} school{counts.matched === 1 ? '' : 's'}
                        <ArrowRight size={16} />
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          // ── UPLOAD STEP ──
          <UploadStep
            loading={loading}
            dragOver={dragOver}
            setDragOver={setDragOver}
            fileRef={fileRef}
            observedOn={observedOn}
            setObservedOn={setObservedOn}
            onFile={doUpload}
          />
        )}
      </div>
    </div>
  )
}

function UploadStep({ loading, dragOver, setDragOver, fileRef, observedOn, setObservedOn, onFile }) {
  return (
    <div className="max-w-2xl space-y-5">
      <p className="text-[15.5px] leading-relaxed text-ink2">
        Drop in a single diocesan enrollment export — an admissions dashboard
        (School · New · Returning · Total) or the detailed grade × gender / ethnicity / race matrix. We
        route each row to the right school by name, keep the grade and demographic breakdowns, and let
        you review anything ambiguous before it&apos;s applied.
      </p>

      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink2">
          As of date (optional — overrides the file&apos;s date)
        </span>
        <DatePicker
          value={observedOn}
          onChange={setObservedOn}
          className="b2-input w-52 font-semibold"
        />
      </label>

      <div
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragOver(false)
          const f = e.dataTransfer?.files?.[0]
          if (f) onFile(f)
        }}
        data-active={dragOver ? 'true' : undefined}
        className="b2-drop py-12"
      >
        <span className="b2-drop-icon">
          {loading ? <Loader2 size={28} className="animate-spin" aria-hidden="true" /> : <UploadCloud size={28} aria-hidden="true" />}
        </span>
        <div>
          <p className="text-heading font-semibold text-ink">
            {loading ? 'Reading your file…' : 'Drop your diocesan file here'}
          </p>
          <p className="mt-1 text-[14px] text-ink2">CSV or Excel (.xlsx), up to 25 MB.</p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => fileRef.current?.click()}
          className="btn btn-primary mt-1"
        >
          Choose a file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) onFile(f)
            e.target.value = ''
          }}
        />
      </div>
    </div>
  )
}

const RESULT_TONE = { applied: 'good', superseded: 'watch', skipped: 'neutral', failed: 'risk' }
const RESULT_COLUMNS = [
  { key: 'name', header: 'School', render: (r) => <span className="font-semibold">{r.name ?? '—'}</span> },
  { key: 'status', header: 'Status', render: (r) => <span className="capitalize">{r.status}</span> },
  {
    key: 'totalEnrolled',
    header: 'Enrolled',
    num: true,
    render: (r) => (Number.isFinite(r.totalEnrolled) ? r.totalEnrolled.toLocaleString('en-US') : '—'),
  },
  {
    key: 'note',
    header: 'Note',
    className: 'text-ink2',
    render: (r) =>
      r.status === 'superseded' && Number.isFinite(r.supersededManual)
        ? `Replaced manual ${r.supersededManual.toLocaleString('en-US')}`
        : r.reason || '—',
  },
]

function ApplyResult({ result, onStartOver }) {
  const { total = 0, applied = 0, superseded = 0, skipped = 0, failed = 0, results = [] } = result || {}
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div className="b2-callout b2-good">
        <CheckCircle2 size={16} aria-hidden="true" />
        <div>
          <h2 className="text-heading font-semibold text-ink">Enrollment applied</h2>
          <p className="text-small text-ink2">
            {applied} applied · {superseded} superseded manual · {skipped} skipped
            {failed ? ` · ${failed} failed` : ''} of {total}.
          </p>
        </div>
      </div>

      <DataTable
        columns={RESULT_COLUMNS}
        rows={results}
        rowKey={(r, i) => r.schoolId ?? i}
        markOf={(r) => RESULT_TONE[r.status] ?? 'neutral'}
        caption="Diocesan import results by school"
      />

      <button type="button" onClick={onStartOver} className="btn btn-secondary">
        <RotateCcw size={14} aria-hidden="true" /> Import another file
      </button>
    </motion.div>
  )
}
