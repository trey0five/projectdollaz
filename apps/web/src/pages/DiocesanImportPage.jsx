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
// AURORA (2026-10-15): the Enrollment band (org chip, "Diocesan import", one
// plain sentence per step, the step's counts as glass cards) over one section
// per step — upload, check each match, what happened. The method text sits in
// How this works. The review table scrolls in its own overflow-x container.
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
  ListChecks,
  Rows3,
  SkipForward,
  XCircle,
  History,
} from 'lucide-react'
import BillingBanner from '../components/BillingBanner.jsx'
import DatePicker from '../components/ui/DatePicker.jsx'
import { Pill, DataTable } from '../components/ui/surface/index.js'
import '../styles/pending/b2-finance.css'
import '../styles/pending/aurora-enroll-acad.css'
import DiocesanReviewTable from '../components/enrollment/DiocesanReviewTable.jsx'
import ModuleBreadcrumb from '../components/module/ModuleBreadcrumb.jsx'
import { ModuleAccent } from '../components/module/ModuleTabs.jsx'
import { DomainStatePanel } from '../components/domain/DomainCommandCenter.jsx'
import {
  AuroraHero,
  AuroraButton,
  AuroraSection,
  AuroraTile,
  AuroraTileGrid,
  AuroraLightButton,
  HowThisWorks,
  VerdictEm,
} from '../components/ui/aurora/index.js'
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
  const { orgId, orgName, orgResolved, isMultiSchool } = useScope()
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
        <DomainStatePanel
          moduleKey="enrollment"
          title="Enrollment"
          eyebrow="Diocesan import"
          showBack
          verdict="This is a diocese-wide import."
          icon={GraduationCap}
          text="It works for organizations with more than one school."
          sub="Import each school's roster from its Enrollment page instead."
          action={
            <AuroraLightButton variant="ghost" to="/enrollment">
              Open Enrollment
            </AuroraLightButton>
          }
        />
      </div>
    )
  }

  // A batch resumed through ?importId that was ALREADY applied is its own
  // step: the table is read-only and nothing can be applied again, so the band
  // must not invite a check-then-apply that cannot happen.
  const step = result ? 'done' : payload?.status === 'applied' ? 'applied' : payload ? 'review' : 'upload'
  const appliedRows = (payload?.rows ?? []).filter((r) => r.decision === 'applied').length

  // ONE plain sentence per step, from the real counts.
  const verdict =
    step === 'done' ? (
      <>
        <VerdictEm tone="good">
          {result.applied ?? 0} school{(result.applied ?? 0) === 1 ? '' : 's'} updated
        </VerdictEm>
        {result.failed ? (
          <>
            , <VerdictEm tone="risk">{result.failed} failed</VerdictEm>
          </>
        ) : null}
        .
      </>
    ) : step === 'applied' ? (
      <>
        This file was already applied to{' '}
        <VerdictEm tone="good">
          {appliedRows} school{appliedRows === 1 ? '' : 's'}
        </VerdictEm>
        .
      </>
    ) : step === 'review' ? (
      <>
        <VerdictEm>
          {counts.matched} school{counts.matched === 1 ? '' : 's'} ready
        </VerdictEm>
        {counts.review > 0 ? (
          <>
            , <VerdictEm tone="watch">{counts.review} still need a match</VerdictEm>
          </>
        ) : null}
        . Check each match, then confirm below.
      </>
    ) : (
      <>One enrollment file fills in every school. You check each match before anything is saved.</>
    )

  const kpis =
    step === 'applied'
      ? [
          { key: 'rows', icon: Rows3, label: 'Rows', value: String(counts.total) },
          { key: 'applied', icon: CheckCircle2, label: 'Applied', value: String(appliedRows) },
        ]
      : step === 'review'
      ? [
          { key: 'rows', icon: Rows3, label: 'Rows', value: String(counts.total) },
          { key: 'ready', icon: CheckCircle2, label: 'Ready', value: String(counts.matched) },
          {
            key: 'review',
            icon: ListChecks,
            label: 'Need review',
            value: String(counts.review),
            verdict: counts.review ? 'watch' : null,
            verdictLabel: counts.review ? 'To check' : null,
          },
          { key: 'skipped', icon: SkipForward, label: 'Skipped', value: String(counts.skipped) },
        ]
      : step === 'done'
        ? [
            { key: 'applied', icon: CheckCircle2, label: 'Applied', value: String(result.applied ?? 0) },
            { key: 'superseded', icon: History, label: 'Replaced a typed figure', value: String(result.superseded ?? 0) },
            { key: 'skipped', icon: SkipForward, label: 'Skipped', value: String(result.skipped ?? 0) },
            {
              key: 'failed',
              icon: XCircle,
              label: 'Failed',
              value: String(result.failed ?? 0),
              verdict: result.failed ? 'risk' : null,
            },
          ]
        : null

  const actions =
    step === 'done' || step === 'applied' ? (
      <>
        <AuroraButton variant="primary" onClick={startOver} icon={<RotateCcw size={18} aria-hidden="true" />}>
          Import another file
        </AuroraButton>
        <AuroraButton to="/enrollment" icon={<GraduationCap size={18} aria-hidden="true" />}>
          Open Enrollment
        </AuroraButton>
      </>
    ) : step === 'review' ? (
      <>
        {/* NOT an apply button: the page exists so ambiguous rows are checked
            before anything is written. The ONE apply is the sticky "Confirm &
            apply" bar under the table; the band takes the reader to the rows. */}
        <AuroraButton variant="primary" href="#diocesan-review" icon={<ListChecks size={18} aria-hidden="true" />}>
          Check the matches
        </AuroraButton>
        <AuroraButton onClick={doDiscard} icon={<Trash2 size={18} aria-hidden="true" />}>
          Discard
        </AuroraButton>
      </>
    ) : (
      // The dropzone right under the band carries "Choose a file" — a second
      // copy here was the same button twice, a few pixels apart.
      <>
        <AuroraButton to="/enrollment" icon={<GraduationCap size={18} aria-hidden="true" />}>
          Back to Enrollment
        </AuroraButton>
      </>
    )

  return (
    <div className="min-h-screen">
      <BillingBanner />
      <ModuleAccent moduleKey="enrollment">
      <div className="au-scope mx-auto max-w-page px-4 py-6 sm:px-10 sm:py-8">
        <div className="mb-3">
          <ModuleBreadcrumb
            crumbs={[
              { label: 'Dashboard', to: '/app' },
              { label: 'Enrollment', to: '/enrollment' },
              { label: 'Diocesan import' },
            ]}
          />
        </div>

        <AuroraHero
          moduleKey="enrollment"
          school={orgName ?? null}
          eyebrow="Diocesan import"
          title="Enrollment"
          verdict={verdict}
          actions={actions}
          kpis={kpis}
        />

        {error && (
          <div className="b2-callout b2-risk mt-6" role="alert">
            <AlertTriangle size={14} aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        {/* ── APPLY RESULT ── */}
        {result ? (
          <ApplyResult result={result} />
        ) : payload ? (
          // ── REVIEW STEP ──
          <AuroraSection
            first
            id="diocesan-review"
            icon={ListChecks}
            title={step === 'applied' ? 'What was applied' : 'Check each match'}
            subtitle={step === 'applied' ? 'Read only — this file is already saved' : "Pick a school for anything we weren't sure of"}
            count={step === 'applied' ? 'Applied' : counts.review ? `${counts.review} to check` : `${counts.matched} ready`}
          >
            <div className="space-y-5 pb-28">
              <div className="flex flex-wrap items-end justify-between gap-3">
                {payload.fileName ? (
                  <p className="flex min-w-0 items-center gap-1.5 break-words text-[13px] text-ink2">
                    <FileSpreadsheet size={14} className="shrink-0" /> {payload.fileName}
                    {payload.sourceShape ? <Pill className="ml-1 capitalize">{payload.sourceShape}</Pill> : null}
                  </p>
                ) : (
                  <span />
                )}
                <label className="block">
                  <span className="b2-label">As of date</span>
                  <DatePicker
                    value={observedOn}
                    onChange={setObservedOn}
                    disabled={applied}
                    className="b2-input w-44 font-semibold"
                  />
                </label>
              </div>

              {Array.isArray(payload.warnings) && payload.warnings.length > 0 && (
                <AuroraTileGrid stack>
                  {payload.warnings.map((w, i) => (
                    <AuroraTile key={i} row art={false} icon={AlertTriangle} tone="watch" title={w} />
                  ))}
                </AuroraTileGrid>
              )}

              <div className="au-card au-card-flat au-register min-w-0">
                <DiocesanReviewTable
                  rows={payload.rows || []}
                  schoolOptions={payload.schoolOptions || []}
                  decisions={decisions}
                  onRowChange={onRowChange}
                  applied={applied}
                />
              </div>

              {/* Sticky confirm-and-apply bar. */}
              {!applied && (
                <div className="fixed inset-x-0 bottom-0 z-40 border-t border-hair bg-white shadow-float lg:left-64">
                  <div className="mx-auto flex max-w-page flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-10">
                    <p className="text-[14px] text-ink2">
                      <b className="text-ink">{counts.matched}</b> school{counts.matched === 1 ? '' : 's'} ready
                      {counts.review > 0 && <span className="text-ink"> · {counts.review} still need a match</span>}
                    </p>
                    <AuroraLightButton
                      onClick={doApply}
                      disabled={applying || counts.matched === 0}
                      icon={applying ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
                    >
                      {applying ? (
                        'Applying…'
                      ) : (
                        <>
                          Confirm &amp; apply {counts.matched} school{counts.matched === 1 ? '' : 's'}
                          <ArrowRight size={16} aria-hidden="true" />
                        </>
                      )}
                    </AuroraLightButton>
                  </div>
                </div>
              )}
            </div>
          </AuroraSection>
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

        <HowThisWorks>
          <p>
            Drop in one diocesan enrollment export — an admissions dashboard (School · New · Returning · Total) or the
            detailed grade × gender / ethnicity / race matrix.
          </p>
          <p>
            Each row is routed to the right school by name, keeping the grade and demographic breakdowns. Clear
            matches are ready to go; anything ambiguous waits for you to pick a school or skip it.
          </p>
          <p>
            Applying writes each school&apos;s enrollment. Where it replaces a figure someone typed in, the typed
            figure is kept as history and can be restored from that school&apos;s Enrollment page.
          </p>
        </HowThisWorks>
      </div>
      </ModuleAccent>
    </div>
  )
}

function UploadStep({ loading, dragOver, setDragOver, fileRef, observedOn, setObservedOn, onFile }) {
  return (
    <AuroraSection first icon={UploadCloud} title="Upload the file" subtitle="CSV or Excel, up to 25 MB">
      <div className="space-y-5">
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.12em] text-ink2">
            As of date (optional — overrides the file&apos;s date)
          </span>
          <DatePicker value={observedOn} onChange={setObservedOn} className="b2-input w-52 font-semibold" />
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
            <p className="mt-1 text-[14px] text-ink2">One file, every school.</p>
          </div>
          <AuroraLightButton disabled={loading} onClick={() => fileRef.current?.click()} icon={<UploadCloud size={15} aria-hidden="true" />}>
            Choose a file
          </AuroraLightButton>
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
    </AuroraSection>
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
        ? `Replaced a typed ${r.supersededManual.toLocaleString('en-US')}`
        : r.reason || '—',
  },
]

function ApplyResult({ result }) {
  const { total = 0, applied = 0, superseded = 0, skipped = 0, failed = 0, results = [] } = result || {}
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
      <AuroraSection
        first
        icon={CheckCircle2}
        tone={failed ? 'risk' : 'good'}
        title="What happened"
        subtitle="Enrollment applied, school by school"
        count={`${applied} applied · ${superseded} replaced · ${skipped} skipped${failed ? ` · ${failed} failed` : ''} of ${total}`}
      >
        <div className="au-card au-card-flat au-register min-w-0">
          <DataTable
            columns={RESULT_COLUMNS}
            rows={results}
            rowKey={(r, i) => r.schoolId ?? i}
            markOf={(r) => RESULT_TONE[r.status] ?? 'neutral'}
            caption="Diocesan import results by school"
          />
        </div>
      </AuroraSection>
    </motion.div>
  )
}
