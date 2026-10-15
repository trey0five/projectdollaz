// ─────────────────────────────────────────────────────────────────────────────
// StudentImport — the REVIEWED roster import (STATELESS preview → commit; the
// Phase 5 student-level path): drop a OneRoster users.csv (plus an optional
// demographics.csv) or a simple flat CSV → POST import/preview (NO DB write) →
// review the candidate rows (new/update/unchanged/skipped badges, warnings,
// per-row include checkboxes) → pick merge/replace → POST import/commit with the
// included rows → toast with counts.
//
// Its sibling RosterUpload is no longer "the counts-only one" — it creates the
// same student records in a single step. The only difference left, and the only
// difference either card's copy may claim, is THIS preview step. Both paths land
// records and both promote the period's enrollment.
//
// AND THIS PANEL HAS TO SAY SO. The claim above shipped once as copy alone: the
// commit route passed no supersedeManual, so a hand-entered figure survived
// untouched, and this panel printed "Roster imported — 436 added" and nothing
// about the number — records landed, the count did not, and no sentence said so.
// That is the reported bug wearing the other card's clothes. The commit response
// carries `promote`, so the outcome is rendered through the SAME
// summarizeRosterUpload the one-step panel uses (one place to change, two cards),
// down to the Restore-my-number undo.
//
// The one asymmetry left, stated on the card rather than papered over: this path
// has no file date to honour, so it promotes into TODAY's fiscal period, while
// the one-step upload promotes into the period the file is dated to.
//
// FERPA note: preview rows carry names — this surface is write-role gated by
// the server and lives only on the role-gated add-data path.
//
// PREMIUM UI P4 (a2): it renders inside the add-data wizard's work Panel, so it
// adds no box of its own — a dashed dropzone on the ground, the preview as the
// ledger table (sticky caps head, hairline rows, the action as a status Pill),
// the confirm row and outcomes as hairline-ruled blocks, flat Buttons.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertTriangle,
  X,
  Users,
  RefreshCcw,
  Undo2,
  GraduationCap,
} from 'lucide-react'
import { enrollmentApi, apiErrorMessage } from '../../lib/api.js'
import { FormError, FormSuccess } from '../auth/fields.jsx'
import { GRADE_LABELS } from './studentFilters.jsx'
import { STUDENT_STATUS_LABELS } from '../../lib/demographicVocab.js'
import { summarizeRosterUpload } from './rosterUploadSummary.js'
import { Button, Pill } from '../ui/surface/index.js'
import '../../styles/pending/a2-carry.css'

/** Preview action → the Pill's mark tone (status as a 2px mark, ink text). */
const ACTION_TONE = {
  new: 'good',
  update: 'neutral',
  unchanged: 'neutral',
  skipped: 'watch',
}

function SummaryStat({ label, value, tone }) {
  return (
    <Pill variant="status" tone={tone} className="tabular-nums">
      {value.toLocaleString('en-US')} {label}
    </Pill>
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
  const [result, setResult] = useState(null) // { created, updated, deleted, total, promote? }
  const [restoring, setRestoring] = useState(false)
  const [restored, setRestored] = useState(false)
  const [restoreErr, setRestoreErr] = useState('')

  const reset = () => {
    setFile(null)
    setDemFile(null)
    setPreview(null)
    setResult(null)
    setErr('')
    setRestored(false)
    setRestoreErr('')
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

  // The commit response, reshaped into the ONE summary the other card renders —
  // `promote` is what syncRosterSnapshot actually did, so every sentence below is
  // a fact the server sent rather than an inference from what we asked for.
  const applied = useMemo(() => {
    if (!result) return null
    const p = result.promote ?? null
    return summarizeRosterUpload({
      promoted: p?.promoted === true,
      superseded: p?.superseded === true,
      supersededManual: p?.supersededManual ?? null,
      records: {
        created: result.created ?? 0,
        updated: result.updated ?? 0,
        deleted: result.deleted ?? 0,
        total: result.total ?? 0,
      },
      enrollment: p?.promoted
        ? { value: p.totalEnrolled, source: 'roster', fiscalPeriodId: p.fiscalPeriodId ?? null }
        : null,
    })
  }, [result])

  const restore = async () => {
    const periodId = applied?.enrollment.restorePeriodId
    if (!schoolId || !periodId || restoring) return
    setRestoring(true)
    setRestoreErr('')
    try {
      await enrollmentApi.revertManual(schoolId, { periodId })
      setRestored(true)
      onApplied?.()
    } catch (e) {
      setRestoreErr(apiErrorMessage(e, 'Could not restore your number. Try again from the Enrollment overview.'))
    } finally {
      setRestoring(false)
    }
  }

  return (
    <div>
      <p className="mb-4 max-w-[70ch] text-[14px] leading-relaxed text-ink2">
        Import your <span className="font-semibold text-ink">whole student roster</span> from a CSV —
        a OneRoster <code className="text-[13px]">users.csv</code> (add{' '}
        <code className="text-[13px]">demographics.csv</code> alongside for birth dates and
        demographics) or a simple list with <code className="text-[13px]">firstName, lastName, grade…</code>{' '}
        columns. You review every row before anything is saved. Importing also sets the enrollment
        figure for the <span className="font-semibold text-ink">current period</span> from your
        roster — the one-step upload does the same, but dates it from the file instead.
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
            data-over={dragOver ? 'true' : undefined}
            className={`a2-drop flex-col items-center justify-center px-6 py-8 text-center ${canEdit ? '' : 'opacity-60'}`}
          >
            <Users size={24} className="mb-2" aria-hidden />
            <p className="text-[15px] font-semibold text-ink">
              Drop a student CSV here{canEdit ? ', or' : ''}
            </p>
            {canEdit && (
              <Button
                variant="secondary"
                size="sm"
                className="mt-2"
                onClick={() => fileRef.current?.click()}
                icon={<FileText size={14} />}
              >
                Choose CSV
              </Button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => pickFile(e.target.files?.[0])}
            />
            <p className="mt-2 text-[12px] text-ink2">CSV only · up to 2,000 students per import</p>
          </div>

          {file && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="a2-block"
            >
              <p className="flex items-center gap-2 text-[15px] font-semibold text-ink">
                <FileText size={16} className="shrink-0 text-ink2" aria-hidden />
                <span className="min-w-0 truncate">{file.name}</span>
                <span className="shrink-0 text-[13px] font-normal tabular-nums text-ink2">
                  ({Math.max(1, Math.round(file.size / 1024))} KB)
                </span>
                <button
                  type="button"
                  onClick={() => pickFile(null)}
                  aria-label="Clear selected file"
                  data-tone="risk"
                  className="a2-icon-btn ml-auto shrink-0"
                >
                  <X size={15} />
                </button>
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => demRef.current?.click()}
                  icon={<FileText size={14} />}
                  className="max-w-full"
                >
                  <span className="truncate">{demFile ? demFile.name : 'Add demographics.csv (optional)'}</span>
                </Button>
                {demFile && (
                  <button
                    type="button"
                    onClick={() => {
                      setDemFile(null)
                      if (demRef.current) demRef.current.value = ''
                    }}
                    aria-label="Clear demographics file"
                    data-tone="risk"
                    className="a2-icon-btn"
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
                <Button
                  variant="primary"
                  onClick={runPreview}
                  disabled={busy}
                  icon={<UploadCloud size={15} className={busy ? 'motion-safe:animate-pulse' : ''} />}
                >
                  {busy ? 'Reading…' : 'Preview import'}
                </Button>
              </div>
            </motion.div>
          )}
        </>
      )}

      {err && <div className="mt-3"><FormError>{err}</FormError></div>}

      {/* Step 2 — preview & confirm */}
      {preview && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="a2-eyebrow mr-2">
              {preview.shape === 'oneroster' ? 'OneRoster file' : 'Simple CSV'}
            </span>
            {summary && (
              <>
                <SummaryStat label="new" value={summary.new ?? 0} tone={ACTION_TONE.new} />
                <SummaryStat label="updated" value={summary.update ?? 0} tone={ACTION_TONE.update} />
                <SummaryStat label="unchanged" value={summary.unchanged ?? 0} tone={ACTION_TONE.unchanged} />
                <SummaryStat label="skipped" value={summary.skipped ?? 0} tone={ACTION_TONE.skipped} />
              </>
            )}
            <Button variant="quiet" size="sm" className="ml-auto" onClick={reset} icon={<RefreshCcw size={13} />}>
              Start over
            </Button>
          </div>

          {warnings.length > 0 && (
            <div className="a2-note" data-tone="watch">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-small font-semibold text-ink">
                  <AlertTriangle size={14} className="text-ink2" aria-hidden /> {warnings.length} warning
                  {warnings.length === 1 ? '' : 's'} while reading the file
                </p>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-small text-ink2">
                  {warnings.slice(0, 8).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          <div className="dt-wrap max-h-80 border-y border-hair">
            <table className="dt min-w-[560px]">
              <thead>
                <tr>
                  <th scope="col">Include</th>
                  <th scope="col">Row</th>
                  <th scope="col">Student</th>
                  <th scope="col">Grade</th>
                  <th scope="col">Status</th>
                  <th scope="col">Issues</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const st = r.student ?? {}
                  const skipped = r.action === 'skipped'
                  return (
                    <tr key={i} className={skipped ? 'opacity-60' : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          checked={included.has(i) && !skipped}
                          disabled={skipped}
                          onChange={() => toggleRow(i)}
                          aria-label={`Include ${st.firstName ?? ''} ${st.lastName ?? ''}`}
                          className="h-4 w-4 rounded accent-[#2563eb]"
                        />
                      </td>
                      <td>
                        <Pill variant="status" tone={ACTION_TONE[r.action] ?? 'neutral'}>
                          {r.action}
                        </Pill>
                      </td>
                      <td className="font-semibold text-ink">
                        {st.lastName ?? '—'}, {st.firstName ?? '—'}
                      </td>
                      <td className="text-ink2">{GRADE_LABELS[st.grade] ?? st.grade ?? '—'}</td>
                      <td className="text-ink2">
                        {STUDENT_STATUS_LABELS[st.status] ?? st.status ?? 'Enrolled'}
                      </td>
                      <td className="text-[12px] text-ink2">{(r.issues ?? []).join('; ')}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Merge / replace + confirm */}
          <div className="flex flex-wrap items-center gap-4 border-t border-hair pt-4">
            <div className="flex flex-wrap items-center gap-4">
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
                    className="mt-0.5 h-4 w-4 accent-[#2563eb]"
                  />
                  <span>
                    <span className="block text-[14px] font-semibold text-ink">{label}</span>
                    <span className="block text-[12px] text-ink2">{blurb}</span>
                  </span>
                </label>
              ))}
            </div>
            {mode === 'replace' && (
              <p className="a2-note" data-tone="watch">
                <AlertTriangle size={13} aria-hidden /> Replace deletes every current student first — only the
                checked rows survive.
              </p>
            )}
            <Button
              variant="primary"
              className="ml-auto"
              onClick={commit}
              disabled={busy || includedCount === 0}
              icon={<CheckCircle2 size={15} className={busy ? 'motion-safe:animate-pulse' : ''} />}
            >
              {busy
                ? 'Importing…'
                : `Import ${includedCount.toLocaleString('en-US')} student${includedCount === 1 ? '' : 's'}`}
            </Button>
          </div>
        </motion.div>
      )}

      {/* Step 3 — applied. TWO facts, two sentences, both read off the response:
          what was SAVED, and what happened to this period's ENROLLMENT. One
          reassuring sentence covering an outcome that did not occur is the bug
          both of these cards exist to stop repeating. */}
      {applied && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="mt-4 space-y-4">
          <FormSuccess>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 size={15} /> Import complete.
            </span>
          </FormSuccess>

          {/* 1 — records */}
          <div className="border-t border-hair pt-3">
            <p className="flex items-start gap-2 text-[14px] font-semibold text-ink">
              <GraduationCap size={15} className="mt-[2px] shrink-0 text-ink2" aria-hidden />
              {applied.recordsLine}
            </p>
            <Button
              to="/enrollment?tab=records"
              variant="primary"
              size="sm"
              className="mt-2.5"
              icon={<Users size={14} />}
            >
              Open Records
            </Button>
          </div>

          {/* 2 — this period's enrollment */}
          <div className="border-t border-hair pt-3">
            <p className="text-[14px] font-semibold text-ink">
              {(restored && applied.enrollment.restoredLine) || applied.enrollment.line}
            </p>
            {applied.enrollment.reason && !restored && (
              <p className="mt-1 text-small leading-relaxed text-ink2">{applied.enrollment.reason}</p>
            )}
            {applied.enrollment.branch === 'superseded' && applied.enrollment.restorePeriodId && (
              <div className="mt-2.5">
                {restored ? (
                  <p className="a2-note" data-tone="good">
                    Restored — your number is the one in force.
                  </p>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={restore}
                    disabled={restoring}
                    icon={<Undo2 size={14} />}
                  >
                    {restoring ? 'Restoring…' : 'Restore my number'}
                  </Button>
                )}
                {restoreErr && (
                  <p className="a2-note mt-2" data-tone="risk">
                    {restoreErr}
                  </p>
                )}
              </div>
            )}
          </div>

          <Button variant="quiet" size="sm" onClick={reset} icon={<RefreshCcw size={13} />}>
            Import another file
          </Button>
        </motion.div>
      )}
    </div>
  )
}
