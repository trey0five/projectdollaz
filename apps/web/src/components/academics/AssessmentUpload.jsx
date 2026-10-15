// ─────────────────────────────────────────────────────────────────────────────
// AssessmentUpload — preview, then commit.
//
// The two-step exists because these files are unpredictable: a publisher export
// has title rows, odd column names and sometimes another school's data in it.
// The preview shows exactly what the parser understood — shape, year, subjects,
// row count, warnings, and a sample — BEFORE anything is written, so nobody
// discovers a mis-parse by finding wrong numbers on a board slide.
//
// PREMIUM UI P4 (a2): it renders inside the add-data wizard's work Panel, so it
// adds no box of its own;
// the dropzone is a dashed hairline on the ground at the panel radius
// (keyboard-reachable: the file input is sr-only, not display:none), the eyebrow
// is ink over a 2px module-hue rule, the preview is a hairline-ruled block of
// key/value facts, notes carry a 2px semantic mark, and actions are flat Buttons.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, CheckCircle2, FileUp, Loader2 } from 'lucide-react'
import { TEST_TYPE_KEYS, TEST_TYPE_LABELS } from '../../lib/academicsVocab.js'
import { academicsApi } from '../../lib/api.js'
import Button from '../ui/surface/Button.jsx'
import '../../styles/pending/a2-carry.css'

/** The same hue as an RGB triple, for `--c-module` (the eyebrow's 2px rule). */
const HUE_VAR = { '--c-module': '13 148 136' }

export default function AssessmentUpload({ schoolId, canEdit, onDone }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)
  const [needsType, setNeedsType] = useState(false)
  const [chosenType, setChosenType] = useState('')

  const reset = () => {
    setFile(null)
    setPreview(null)
    setDone(null)
    setError('')
    setNeedsType(false)
    setChosenType('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const doPreview = async (f, testType = chosenType) => {
    setBusy(true)
    setError('')
    setDone(null)
    try {
      const fd = new FormData()
      fd.append('file', f)
      if (testType) fd.append('testType', testType)
      const res = await academicsApi.preview(schoolId, fd)
      setPreview(res.data ?? res)
      setNeedsType(false)
    } catch (e) {
      const message = e?.response?.data?.message ?? 'Could not read that file.'
      // The parser refuses to guess a test it cannot recognise rather than
      // labelling the file ACT — so this is the one error the reader can fix
      // themselves, and the picker appears instead of a dead end.
      setNeedsType(/which test/i.test(message))
      setError(message)
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
      if (chosenType || preview?.testType) fd.append('testType', chosenType || preview.testType)
      if (preview?.years?.[0]) fd.append('schoolYear', String(preview.years[0]))
      const res = await academicsApi.commit(schoolId, fd)
      setDone(res.data ?? res)
      setPreview(null)
      onDone?.()
    } catch (e) {
      setError(e?.response?.data?.message ?? 'Could not save those results.')
    } finally {
      setBusy(false)
    }
  }

  if (!canEdit) return null

  return (
    <div style={HUE_VAR}>
      <p className="a2-eyebrow">
        Assessment scores
      </p>
      <h3 className="a2-title">Upload a results file</h3>
      <p className="mt-1 max-w-[70ch] text-small text-ink2">
        A diocesan summary, a publisher export, or a student-level file. Title rows and odd column names are handled —
        you will see exactly what was read before anything is saved.
      </p>

      <label
        className="a2-drop mt-4 cursor-pointer items-center gap-3 px-4 py-4"
      >
        <FileUp size={20} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-small text-ink">
          {file ? file.name : 'Choose a CSV file…'}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (!f) return
            setFile(f)
            doPreview(f)
          }}
        />
        {busy ? <Loader2 size={16} className="motion-safe:animate-spin text-ink2" aria-label="Reading…" /> : null}
      </label>

      <AnimatePresence>
        {preview ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="a2-block"
          >
            <div className="a2-facts">
              {[
                ['Shape', preview.scope === 'student' ? 'Student-level' : 'School summary'],
                ['Test', (preview.testType ?? '').toUpperCase()],
                ['Score', preview.scoreType === 'percentile' ? 'National percentile' : 'Scale score'],
                ['Years', (preview.years ?? []).join(', ') || '—'],
                ['Rows', preview.rows],
                ['Subjects', (preview.subjects ?? []).length],
              ].map(([k, v]) => (
                <span key={k} className="a2-fact">
                  <b>{k}</b>
                  <span>{v}</span>
                </span>
              ))}
            </div>

            {preview.match ? (
              <p className="mt-3 text-small text-ink2">
                Roster match: <b className="tabular-nums text-ink">{preview.match.matched}</b> matched,{' '}
                {preview.match.unmatched} unmatched
                {preview.match.ambiguous > 0 ? ` (${preview.match.ambiguous} ambiguous — left unattached on purpose)` : ''}.
              </p>
            ) : null}

            {(preview.warnings ?? []).map((w) => (
              <p key={w} className="a2-note mt-2" data-tone="watch">
                <AlertTriangle size={13} aria-hidden /> {w}
              </p>
            ))}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" onClick={doCommit} disabled={busy}>
                Save these results
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
          <CheckCircle2 size={14} aria-hidden /> Saved — {done.resultsCreated ?? 0} student rows, {done.aggregatesUpserted ?? 0} summary rows.
        </p>
      ) : null}
      {needsType && file ? (
        <div className="a2-block">
          <p className="a2-note" data-tone="watch">
            Nothing in this file names the test. Choose it and we will read the file again.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              aria-label="Test type"
              value={chosenType}
              onChange={(e) => setChosenType(e.target.value)}
              className="a2-field" style={{ width: "auto", minWidth: "14rem", maxWidth: "100%" }}
            >
              <option value="">Choose a test…</option>
              {TEST_TYPE_KEYS.map((k) => (
                <option key={k} value={k}>
                  {TEST_TYPE_LABELS[k] ?? k.toUpperCase()}
                </option>
              ))}
            </select>
            <Button variant="primary" disabled={!chosenType || busy} onClick={() => doPreview(file, chosenType)}>
              Read it again
            </Button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="a2-note mt-3" data-tone="risk">
          {error}
        </p>
      ) : null}
    </div>
  )
}
