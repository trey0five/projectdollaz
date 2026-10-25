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
//
// PREMIUM UI P4 (a2): it renders inside the add-data wizard's work Panel, so it
// adds no box of its own;
// the dropzone is the shared FileDropZone — a dashed hairline that takes a drop
// or a click (keyboard-reachable: the file input is sr-only, not display:none), the eyebrow
// is ink over a 2px module-hue rule, the preview is a hairline-ruled block of
// key/value facts, notes carry a 2px semantic mark, and actions are flat Buttons.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { academicsApi } from '../../lib/api.js'
import Button from '../ui/surface/Button.jsx'
import FileDropZone from '../ui/FileDropZone.jsx'
import '../../styles/pending/a2-carry.css'

/** The same hue as an RGB triple, for `--c-module` (the eyebrow's 2px rule). */
const HUE_VAR = { '--c-module': '13 148 136' }

export const GRADEBOOK_ACCEPT = '.csv,.tsv,.txt,.xlsx,.xls,.pdf,text/csv,text/plain'

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

  // The ONE way a file arrives — the picker and a drop both call this.
  const chooseFile = (f) => {
    if (!f) return
    setFile(f)
    doPreview(f)
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
    <div style={HUE_VAR}>
      <p className="a2-eyebrow">
        Gradebook
      </p>
      <h3 className="a2-title">Upload course marks</h3>
      <p className="mt-1 max-w-[70ch] text-small text-ink2">
        A gradebook export from your SIS — Excel or CSV — one row per mark, or one row per student with a column per course. Letter
        grades are converted and the letter is kept. You will see what was read before anything is saved.
      </p>

      {/* Drop or choose — both run chooseFile (owner 2026-10-25: "like the finance module"). */}
      <FileDropZone
        className="mt-4"
        testId="gradebook-drop"
        inputRef={inputRef}
        accept={GRADEBOOK_ACCEPT}
        busy={busy}
        fileName={file?.name}
        title={file ? 'Drop another Excel or CSV file here, or choose one' : 'Drop an Excel or CSV file here, or choose one'}
        ariaLabel="Choose a gradebook file (Excel or CSV)"
        hint="Excel, CSV or PDF · one gradebook export at a time"
        onFiles={([f]) => chooseFile(f)}
      />

      <AnimatePresence>
        {preview ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="a2-block"
          >
            <div className="a2-facts">
              {chips.map(([k, v]) => (
                <span key={k} className="a2-fact">
                  <b>{k}</b>
                  <span>{v}</span>
                </span>
              ))}
            </div>

            {preview.match ? (
              <p className="mt-3 text-small text-ink2">
                Roster match: <b className="tabular-nums text-ink">{preview.match.matched}</b> matched, {preview.match.unmatched}{' '}
                unmatched
                {preview.match.ambiguous > 0
                  ? ` (${preview.match.ambiguous} ambiguous — left unattached on purpose)`
                  : ''}
                .
              </p>
            ) : null}

            {(preview.warnings ?? []).map((w) => (
              <p key={w} className="a2-note mt-2" data-tone="watch">
                <AlertTriangle size={13} aria-hidden /> {w}
              </p>
            ))}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" onClick={doCommit} disabled={busy}>
                Save these marks
              </Button>
              <Button variant="secondary" onClick={reset}>
                Cancel
              </Button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {done ? (
        <p className="a2-note mt-3" data-tone="good">
          <CheckCircle2 size={14} aria-hidden /> Saved — {done.created ?? 0} marks across {done.courses ?? 0} course(s),{' '}
          {done.matched ?? 0} matched to the roster.
        </p>
      ) : null}
      {error ? (
        <p className="a2-note mt-3" data-tone="risk">
          {error}
        </p>
      ) : null}
    </div>
  )
}
