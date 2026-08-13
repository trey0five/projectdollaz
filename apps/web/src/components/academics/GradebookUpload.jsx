// ─────────────────────────────────────────────────────────────────────────────
// GradebookUpload — course marks, previewed then committed.
//
// The gradebook parser and its two endpoints have existed since the ingestion
// pass; nothing in the web app called them, so a school could see the gradebook
// summary card and had no way to fill it. This is that door.
//
// It mirrors AssessmentUpload deliberately rather than sharing a component: the
// two files answer different questions (a mark in a course vs a score on an
// exam) and their previews show different things — term coverage and the
// letter/number scale here, test/year/subjects there.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, CheckCircle2, FileUp, Loader2 } from 'lucide-react'
import { academicsApi } from '../../lib/api.js'

const HUE = '#0D9488'

export default function GradebookUpload({ schoolId, canEdit, onDone }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)

  const reset = () => {
    setFile(null)
    setPreview(null)
    setDone(null)
    setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const doPreview = async (f) => {
    setBusy(true)
    setError('')
    setDone(null)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await academicsApi.gradebookPreview(schoolId, fd)
      setPreview(res.data ?? res)
    } catch (e) {
      setError(e?.response?.data?.message ?? 'Could not read that gradebook.')
      setPreview(null)
    } finally {
      setBusy(false)
    }
  }

  const doCommit = async () => {
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      // The parser resolves year and term per row, so commit needs no overrides.
      // Nothing else is appended on purpose: the DTO is whitelist-validated, and
      // an undefined value appended to FormData arrives as the literal string
      // "undefined" — which 400s the whole upload.
      const res = await academicsApi.gradebookCommit(schoolId, fd)
      setDone(res.data ?? res)
      setPreview(null)
      onDone?.()
    } catch (e) {
      setError(e?.response?.data?.message ?? 'Could not save those marks.')
    } finally {
      setBusy(false)
    }
  }

  if (!canEdit) return null

  // Keyed to what gradebook.service.preview ACTUALLY returns — shape, rows,
  // courses[], terms[], warnings, match, sample — not to a hoped-for shape.
  const chips = preview
    ? [
        ['Layout', preview.shape === 'wide' ? 'One row per student' : 'One row per mark'],
        ['Marks', preview.rows ?? 0],
        ['Courses', (preview.courses ?? []).length],
        ['Terms', (preview.terms ?? []).join(', ') || '—'],
      ]
    : []

  return (
    <div className="rounded-2xl border border-navy/10 bg-white p-5">
      <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em]" style={{ color: HUE }}>
        Gradebook
      </p>
      <h3 className="mt-0.5 font-serif text-[19px] font-semibold text-navy">Upload course marks</h3>
      <p className="mt-1 text-[12.5px] text-muted">
        A gradebook export from your SIS — one row per mark, or one row per student with a column per course. Letter
        grades are converted and the letter is kept. You will see what was read before anything is saved.
      </p>

      <label
        className="mt-4 flex cursor-pointer items-center gap-3 rounded-xl border-2 border-dashed px-4 py-4 transition-colors"
        style={{ borderColor: `${HUE}55`, background: `${HUE}08` }}
      >
        <FileUp size={20} style={{ color: HUE }} />
        <span className="flex-1 text-[13px] text-navy">{file ? file.name : 'Choose a CSV file…'}</span>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (!f) return
            setFile(f)
            doPreview(f)
          }}
        />
        {busy ? <Loader2 size={16} className="animate-spin" style={{ color: HUE }} /> : null}
      </label>

      <AnimatePresence>
        {preview ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="mt-4 rounded-xl border border-navy/10 bg-section p-4"
          >
            <div className="flex flex-wrap gap-2">
              {chips.map(([k, v]) => (
                <span key={k} className="rounded-lg bg-white px-2.5 py-1 text-[11.5px] ring-1 ring-navy/10">
                  <b className="font-mono text-[9px] uppercase tracking-wider text-muted">{k}</b>{' '}
                  <span className="font-semibold text-navy">{v}</span>
                </span>
              ))}
            </div>

            {preview.match ? (
              <p className="mt-2.5 text-[12px] text-muted">
                Roster match: <b className="text-navy">{preview.match.matched}</b> matched, {preview.match.unmatched}{' '}
                unmatched
                {preview.match.ambiguous > 0
                  ? ` (${preview.match.ambiguous} ambiguous — left unattached on purpose)`
                  : ''}
                .
              </p>
            ) : null}

            {(preview.warnings ?? []).map((w) => (
              <p key={w} className="mt-2 flex items-start gap-1.5 text-[12px] text-amber-700">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {w}
              </p>
            ))}

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={doCommit}
                disabled={busy}
                className="rounded-xl px-4 py-2 text-[12px] font-bold uppercase tracking-[0.12em] text-white disabled:opacity-50"
                style={{ background: HUE }}
              >
                Save these marks
              </button>
              <button
                type="button"
                onClick={reset}
                className="rounded-xl border border-navy/15 px-4 py-2 text-[12px] text-navy"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {done ? (
        <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-emerald-700">
          <CheckCircle2 size={14} /> Saved — {done.created ?? 0} marks across {done.courses ?? 0} course(s),{' '}
          {done.matched ?? 0} matched to the roster.
        </p>
      ) : null}
      {error ? <p className="mt-3 text-[12.5px] text-danger">{error}</p> : null}
    </div>
  )
}
