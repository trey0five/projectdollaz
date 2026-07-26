// ─────────────────────────────────────────────────────────────────────────────
// StudentImport — the roster CSV import flow (STATELESS preview → commit; the
// Phase 5 student-level path). A NEW card beside RosterUpload (which stays the
// aggregate counts-snapshot path, untouched): drop a OneRoster users.csv (plus
// an optional demographics.csv) or a simple flat CSV → POST import/preview (NO
// DB write) → review the candidate rows (new/update/unchanged/skipped badges,
// warnings, per-row include checkboxes) → pick merge/replace → POST
// import/commit with the included rows → toast with counts.
//
// FERPA note: preview rows carry names — this surface is write-role gated by
// the server and lives only on the role-gated add-data path.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertTriangle,
  X,
  Users,
  RefreshCcw,
} from 'lucide-react'
import { enrollmentApi, apiErrorMessage } from '../../lib/api.js'
import { FormError, FormSuccess } from '../auth/fields.jsx'
import { GRADE_LABELS } from './studentFilters.jsx'
import { STUDENT_STATUS_LABELS } from '../../lib/demographicVocab.js'

const ENROLL_HUE = '#0EA5E9'

const ACTION_BADGE = {
  new: 'border-emerald-300/70 bg-emerald-50 text-emerald-700',
  update: 'border-sky-300/70 bg-sky-50 text-sky-700',
  unchanged: 'border-rule/60 bg-section text-muted',
  skipped: 'border-amber-300/70 bg-amber-50 text-amber-700',
}

function SummaryStat({ label, value, tone }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12.5px] font-bold ${tone}`}>
      {value.toLocaleString('en-US')} {label}
    </span>
  )
}

export default function StudentImport({ schoolId, canEdit, onApplied }) {
  const fileRef = useRef(null)
  const demRef = useRef(null)
  const [file, setFile] = useState(null)
  const [demFile, setDemFile] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [preview, setPreview] = useState(null) // { shape, summary, warnings, rows }
  const [included, setIncluded] = useState(() => new Set())
  const [mode, setMode] = useState('merge')
  const [result, setResult] = useState(null) // { created, updated, deleted, total }

  const reset = () => {
    setFile(null)
    setDemFile(null)
    setPreview(null)
    setResult(null)
    setErr('')
    setMode('merge')
    if (fileRef.current) fileRef.current.value = ''
    if (demRef.current) demRef.current.value = ''
  }

  const pickFile = (f) => {
    setErr('')
    setPreview(null)
    setResult(null)
    setFile(f ?? null)
  }

  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    if (!canEdit) return
    const f = e.dataTransfer?.files?.[0]
    if (f) pickFile(f)
  }

  const runPreview = async () => {
    if (!file || !schoolId || busy) return
    setBusy(true)
    setErr('')
    try {
      const form = new FormData()
      form.append('file', file)
      if (demFile) form.append('demographics', demFile)
      const res = await enrollmentApi.students.importPreview(schoolId, form)
      const p = res.data ?? res
      setPreview(p)
      // Default include: every parseable row (skipped rows can't be sent).
      setIncluded(
        new Set(
          (p.rows ?? [])
            .map((r, i) => (r.action !== 'skipped' ? i : null))
            .filter((i) => i !== null),
        ),
      )
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not read that CSV. Check it is a OneRoster users.csv or a simple student list.'))
    } finally {
      setBusy(false)
    }
  }

  const toggleRow = (i) => {
    setIncluded((prev) => {
      const next = new Set(prev)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
  }

  const commit = async () => {
    if (!preview || busy) return
    const rows = (preview.rows ?? [])
      .filter((r, i) => included.has(i) && r.action !== 'skipped')
      .map((r) => r.student)
    if (!rows.length) {
      setErr('Pick at least one row to import.')
      return
    }
    setBusy(true)
    setErr('')
    try {
      const res = await enrollmentApi.students.importCommit(schoolId, { mode, rows })
      setResult(res.data ?? res)
      setPreview(null)
      setFile(null)
      setDemFile(null)
      if (fileRef.current) fileRef.current.value = ''
      if (demRef.current) demRef.current.value = ''
      onApplied?.()
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not import the roster.'))
    } finally {
      setBusy(false)
    }
  }

  const rows = preview?.rows ?? []
  const summary = preview?.summary ?? null
  const warnings = preview?.warnings ?? []
  const includedCount = rows.filter((r, i) => included.has(i) && r.action !== 'skipped').length

  return (
    <div>
      <p className="mb-3 text-[14.5px] leading-relaxed text-muted">
        Import your <span className="font-semibold text-navy">whole student roster</span> from a CSV —
        a OneRoster <code className="text-[13px]">users.csv</code> (add{' '}
        <code className="text-[13px]">demographics.csv</code> alongside for birth dates and
        demographics) or a simple list with <code className="text-[13px]">firstName, lastName, grade…</code>{' '}
        columns. You review every row before anything is saved.
      </p>

      {/* Step 1 — pick files */}
      {!preview && !result && (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault()
              if (canEdit) setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
              dragOver ? 'bg-sky-50' : 'border-border bg-section/40'
            } ${canEdit ? '' : 'opacity-60'}`}
            style={dragOver ? { borderColor: ENROLL_HUE } : undefined}
          >
            <Users size={26} className="mb-2" style={{ color: ENROLL_HUE }} />
            <p className="text-[15px] font-semibold text-navy">
              Drop a student CSV here{canEdit ? ', or' : ''}
            </p>
            {canEdit && (
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border-2 px-4 py-2 text-[14px] font-semibold text-navy transition-all hover:bg-sky-50"
                style={{ borderColor: `${ENROLL_HUE}80`, backgroundColor: `${ENROLL_HUE}10` }}
              >
                <FileText size={15} /> Choose CSV
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
            <p className="mt-2 text-[12.5px] text-muted">CSV only · up to 2,000 students per import</p>
          </div>

          {file && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 rounded-lg border-2 px-4 py-3.5"
              style={{ borderColor: `${ENROLL_HUE}55`, backgroundColor: `${ENROLL_HUE}08` }}
            >
              <p className="flex items-center gap-2 text-[15px] font-semibold text-navy">
                <FileText size={16} className="shrink-0" style={{ color: ENROLL_HUE }} />
                {file.name}
                <span className="text-[13px] font-normal text-muted">
                  ({Math.max(1, Math.round(file.size / 1024))} KB)
                </span>
                <button
                  type="button"
                  onClick={() => pickFile(null)}
                  aria-label="Clear selected file"
                  className="ml-auto rounded p-1 text-muted hover:text-danger"
                >
                  <X size={15} />
                </button>
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => demRef.current?.click()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-rule/70 bg-white px-3 py-1.5 text-[13px] font-semibold text-muted transition hover:text-navy"
                >
                  <FileText size={14} />
                  {demFile ? demFile.name : 'Add demographics.csv (optional)'}
                </button>
                {demFile && (
                  <button
                    type="button"
                    onClick={() => {
                      setDemFile(null)
                      if (demRef.current) demRef.current.value = ''
                    }}
                    aria-label="Clear demographics file"
                    className="rounded p-1 text-muted hover:text-danger"
                  >
                    <X size={14} />
                  </button>
                )}
                <input
                  ref={demRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => setDemFile(e.target.files?.[0] ?? null)}
                />
                <button
                  type="button"
                  onClick={runPreview}
                  disabled={busy}
                  className="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <UploadCloud size={15} className={busy ? 'animate-pulse' : ''} />
                  {busy ? 'Reading…' : 'Preview import'}
                </button>
              </div>
            </motion.div>
          )}
        </>
      )}

      {err && <div className="mt-3"><FormError>{err}</FormError></div>}

      {/* Step 2 — preview & confirm */}
      {preview && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-lg border px-2.5 py-1 text-[12.5px] font-bold uppercase tracking-[0.08em]"
              style={{ borderColor: `${ENROLL_HUE}55`, backgroundColor: `${ENROLL_HUE}12`, color: '#0369A1' }}
            >
              {preview.shape === 'oneroster' ? 'OneRoster file' : 'Simple CSV'}
            </span>
            {summary && (
              <>
                <SummaryStat label="new" value={summary.new ?? 0} tone={ACTION_BADGE.new} />
                <SummaryStat label="updated" value={summary.update ?? 0} tone={ACTION_BADGE.update} />
                <SummaryStat label="unchanged" value={summary.unchanged ?? 0} tone={ACTION_BADGE.unchanged} />
                <SummaryStat label="skipped" value={summary.skipped ?? 0} tone={ACTION_BADGE.skipped} />
              </>
            )}
            <button
              type="button"
              onClick={reset}
              className="ml-auto inline-flex items-center gap-1 text-[12.5px] font-semibold text-muted underline-offset-2 hover:text-navy hover:underline"
            >
              <RefreshCcw size={13} /> Start over
            </button>
          </div>

          {warnings.length > 0 && (
            <div className="rounded-lg border border-gold/40 bg-gold/10 px-4 py-3">
              <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-[#7a5e00]">
                <AlertTriangle size={14} /> {warnings.length} warning{warnings.length === 1 ? '' : 's'} while
                reading the file
              </p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[13px] text-muted">
                {warnings.slice(0, 8).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="max-h-80 overflow-auto rounded-xl border border-rule/50">
            <table className="w-full min-w-[560px] border-collapse text-[13px]">
              <thead className="sticky top-0 bg-section">
                <tr className="text-left text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted">
                  <th className="px-3 py-2">Include</th>
                  <th className="px-3 py-2">Row</th>
                  <th className="px-3 py-2">Student</th>
                  <th className="px-3 py-2">Grade</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Issues</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const st = r.student ?? {}
                  const skipped = r.action === 'skipped'
                  return (
                    <tr key={i} className={`border-t border-rule/40 ${skipped ? 'opacity-60' : ''}`}>
                      <td className="px-3 py-1.5">
                        <input
                          type="checkbox"
                          checked={included.has(i) && !skipped}
                          disabled={skipped}
                          onChange={() => toggleRow(i)}
                          aria-label={`Include ${st.firstName ?? ''} ${st.lastName ?? ''}`}
                          className="h-4 w-4 rounded accent-sky-500"
                        />
                      </td>
                      <td className="px-3 py-1.5">
                        <span
                          className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10.5px] font-bold uppercase ${
                            ACTION_BADGE[r.action] ?? ACTION_BADGE.unchanged
                          }`}
                        >
                          {r.action}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 font-semibold text-navy">
                        {st.lastName ?? '—'}, {st.firstName ?? '—'}
                      </td>
                      <td className="px-3 py-1.5 text-muted">{GRADE_LABELS[st.grade] ?? st.grade ?? '—'}</td>
                      <td className="px-3 py-1.5 text-muted">
                        {STUDENT_STATUS_LABELS[st.status] ?? st.status ?? 'Enrolled'}
                      </td>
                      <td className="px-3 py-1.5 text-[12px] text-muted">{(r.issues ?? []).join('; ')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Merge / replace + confirm */}
          <div className="flex flex-wrap items-center gap-4 rounded-xl border border-rule/50 bg-cream/40 px-4 py-3">
            <div className="flex items-center gap-4">
              {[
                ['merge', 'Merge', 'Update matches, add the rest'],
                ['replace', 'Replace', 'Swap the whole roster for this file'],
              ].map(([value, label, blurb]) => (
                <label key={value} className="flex cursor-pointer select-none items-start gap-2">
                  <input
                    type="radio"
                    name="import-mode"
                    value={value}
                    checked={mode === value}
                    onChange={() => setMode(value)}
                    className="mt-0.5 h-4 w-4 accent-sky-500"
                  />
                  <span>
                    <span className="block text-[13.5px] font-semibold text-navy">{label}</span>
                    <span className="block text-[11.5px] text-muted">{blurb}</span>
                  </span>
                </label>
              ))}
            </div>
            {mode === 'replace' && (
              <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-700">
                <AlertTriangle size={13} /> Replace deletes every current student first — only the
                checked rows survive.
              </p>
            )}
            <button
              type="button"
              onClick={commit}
              disabled={busy || includedCount === 0}
              className="btn-primary ml-auto inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <CheckCircle2 size={15} className={busy ? 'animate-pulse' : ''} />
              {busy
                ? 'Importing…'
                : `Import ${includedCount.toLocaleString('en-US')} student${includedCount === 1 ? '' : 's'}`}
            </button>
          </div>
        </motion.div>
      )}

      {/* Step 3 — applied */}
      {result && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 space-y-3">
          <FormSuccess>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 size={15} />
              Roster imported — {Number(result.created ?? 0).toLocaleString('en-US')} added,{' '}
              {Number(result.updated ?? 0).toLocaleString('en-US')} updated
              {Number(result.deleted ?? 0) > 0
                ? `, ${Number(result.deleted).toLocaleString('en-US')} removed`
                : ''}
              . {Number(result.total ?? 0).toLocaleString('en-US')} students on the roster.
            </span>
          </FormSuccess>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-muted underline-offset-2 hover:text-navy hover:underline"
          >
            <RefreshCcw size={13} /> Import another file
          </button>
        </motion.div>
      )}
    </div>
  )
}
