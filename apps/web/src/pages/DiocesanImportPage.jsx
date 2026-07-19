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

function StatPill({ label, value, tone = 'neutral' }) {
  const tones = {
    good: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    warn: 'border-gold/40 bg-gold/10 text-amber-700',
    muted: 'border-rule/60 bg-white text-muted',
    neutral: 'border-rule/60 bg-white text-navy',
  }
  return (
    <div className={`flex flex-col rounded-xl border px-4 py-2.5 ${tones[tone]}`}>
      <span className="text-[22px] font-bold tabular-nums leading-none">{value}</span>
      <span className="mt-1 text-[11.5px] font-semibold uppercase tracking-[0.1em]">{label}</span>
    </div>
  )
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
      <div className="min-h-screen bg-section">
        <BillingBanner />
        <div className="mx-auto max-w-page space-y-4 px-4 py-8 sm:px-10">
          <BackLink />
          <div className="card-soft flex flex-col items-center gap-3 px-6 py-14 text-center">
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-gradient text-navy shadow-glow">
              <GraduationCap size={26} />
            </span>
            <h2 className="font-serif text-xl font-semibold text-navy">This is a diocese-wide import</h2>
            <p className="max-w-md text-[15px] text-muted">
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
    <div className="min-h-screen bg-section">
      <BillingBanner />
      <div className="mx-auto max-w-page px-4 py-8 sm:px-10">
        <BackLink />
        <motion.header
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 mt-2 flex items-center gap-3"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gold-gradient text-navy shadow-glow">
            <GraduationCap size={24} />
          </span>
          <div>
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-muted">
              Enrollment · Diocesan import
            </p>
            <h1 className="font-serif text-2xl font-bold text-navy sm:text-3xl">
              One file, every school
            </h1>
          </div>
        </motion.header>

        {error && (
          <div className="mb-5 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger/[0.06] px-4 py-3 text-[14px] text-danger">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ── APPLY RESULT ── */}
        {result ? (
          <ApplyResult result={result} onStartOver={startOver} />
        ) : payload ? (
          // ── REVIEW STEP ──
          <div className="space-y-5 pb-28">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <StatPill label="Rows" value={counts.total} tone="neutral" />
                <StatPill label="Ready" value={counts.matched} tone="good" />
                <StatPill label="Need review" value={counts.review} tone={counts.review ? 'warn' : 'muted'} />
                <StatPill label="Skipped" value={counts.skipped} tone="muted" />
              </div>
              <div className="flex items-end gap-3">
                <label className="block">
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                    As of date
                  </span>
                  <DatePicker
                    value={observedOn}
                    onChange={setObservedOn}
                    disabled={applied}
                    className="w-44 rounded-lg border-2 border-gold/40 bg-white px-3 py-2 text-[15px] font-semibold text-navy outline-none ring-gold/40 focus-visible:ring-2"
                  />
                </label>
                <button
                  type="button"
                  onClick={doDiscard}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rule px-3 py-2 text-[14px] font-semibold text-muted transition-colors hover:border-danger/40 hover:text-danger"
                >
                  <Trash2 size={15} /> Discard
                </button>
              </div>
            </div>

            {payload.fileName && (
              <p className="flex items-center gap-1.5 text-[13px] text-muted">
                <FileSpreadsheet size={14} /> {payload.fileName}
                {payload.sourceShape ? (
                  <span className="ml-1 rounded-full bg-section px-2 py-0.5 text-[12px] font-semibold capitalize text-navy">
                    {payload.sourceShape}
                  </span>
                ) : null}
              </p>
            )}

            {Array.isArray(payload.warnings) && payload.warnings.length > 0 && (
              <ul className="space-y-1 rounded-xl border border-gold/30 bg-gold/[0.06] px-4 py-3">
                {payload.warnings.map((w, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[13px] text-amber-700">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {w}
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
              <div className="fixed inset-x-0 bottom-0 z-40 border-t border-rule/60 bg-white/95 backdrop-blur">
                <div className="mx-auto flex max-w-page items-center justify-between gap-4 px-4 py-3.5 sm:px-10">
                  <p className="text-[14px] text-muted">
                    <b className="text-navy">{counts.matched}</b> school{counts.matched === 1 ? '' : 's'} ready
                    {counts.review > 0 && (
                      <span className="text-amber-700"> · {counts.review} still need a match</span>
                    )}
                  </p>
                  <button
                    type="button"
                    onClick={doApply}
                    disabled={applying || counts.matched === 0}
                    className="btn-gold inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
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
    <div className="mx-auto max-w-2xl space-y-5">
      <p className="text-[15.5px] leading-relaxed text-muted">
        Drop in a single diocesan enrollment export — an admissions dashboard
        (School · New · Returning · Total) or the detailed grade × gender / ethnicity / race matrix. We
        route each row to the right school by name, keep the grade and demographic breakdowns, and let
        you review anything ambiguous before it&apos;s applied.
      </p>

      <label className="block">
        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
          As of date (optional — overrides the file&apos;s date)
        </span>
        <DatePicker
          value={observedOn}
          onChange={setObservedOn}
          className="w-52 rounded-lg border-2 border-gold/40 bg-white px-3 py-2 text-[15px] font-semibold text-navy outline-none ring-gold/40 focus-visible:ring-2"
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
        className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors ${
          dragOver ? 'border-gold bg-gold/10' : 'border-rule/70 bg-white'
        }`}
      >
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gold-gradient text-navy shadow-glow">
          {loading ? <Loader2 size={26} className="animate-spin" /> : <UploadCloud size={26} />}
        </span>
        <div>
          <p className="font-serif text-lg font-semibold text-navy">
            {loading ? 'Reading your file…' : 'Drop your diocesan file here'}
          </p>
          <p className="mt-1 text-[14px] text-muted">CSV or Excel (.xlsx), up to 25 MB.</p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => fileRef.current?.click()}
          className="mt-1 inline-flex items-center gap-1.5 rounded-lg bg-gold-gradient px-4 py-2.5 text-[15px] font-bold uppercase tracking-[0.08em] text-navy shadow-glow transition-transform hover:-translate-y-0.5 disabled:opacity-50"
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

function ApplyResult({ result, onStartOver }) {
  const { total = 0, applied = 0, superseded = 0, skipped = 0, failed = 0, results = [] } = result || {}
  const badge = {
    applied: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    superseded: 'border-gold/40 bg-gold/10 text-amber-700',
    skipped: 'border-rule/60 bg-section text-muted',
    failed: 'border-danger/30 bg-danger/[0.06] text-danger',
  }
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div className="flex items-center gap-3 rounded-2xl border-2 border-emerald-200 bg-emerald-50 px-5 py-4">
        <CheckCircle2 size={26} className="text-emerald-600" />
        <div>
          <h2 className="font-serif text-lg font-bold text-navy">Enrollment applied</h2>
          <p className="text-[14px] text-muted">
            {applied} applied · {superseded} superseded manual · {skipped} skipped
            {failed ? ` · ${failed} failed` : ''} of {total}.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border-2 border-rule/50 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-left">
            <thead>
              <tr className="border-b-2 border-rule/60 bg-section/60 text-[11px] font-bold uppercase tracking-[0.12em] text-muted">
                <th className="px-4 py-3">School</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Enrolled</th>
                <th className="px-4 py-3">Note</th>
              </tr>
            </thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={r.schoolId ?? i} className="border-b border-rule/40">
                  <td className="px-4 py-3 font-semibold text-navy">{r.name ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[12.5px] font-bold capitalize ${badge[r.status] || badge.skipped}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums text-navy">
                    {Number.isFinite(r.totalEnrolled) ? r.totalEnrolled.toLocaleString('en-US') : '—'}
                  </td>
                  <td className="px-4 py-3 text-[13px] text-muted">
                    {r.status === 'superseded' && Number.isFinite(r.supersededManual)
                      ? `Replaced manual ${r.supersededManual.toLocaleString('en-US')}`
                      : r.reason || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <button
        type="button"
        onClick={onStartOver}
        className="inline-flex items-center gap-1.5 rounded-lg border border-gold/60 bg-gold/10 px-4 py-2.5 text-[15px] font-semibold text-navy transition-all hover:bg-gold/20"
      >
        <RotateCcw size={15} /> Import another file
      </button>
    </motion.div>
  )
}
