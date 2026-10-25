// ─────────────────────────────────────────────────────────────────────────────
// AssessmentUpload — preview, then commit.
//
// The two-step exists because these files are unpredictable: a publisher export
// has title rows, odd column names and sometimes another school's data in it.
// The preview shows exactly what the parser understood — shape, year, subjects,
// row count, how each column was read, warnings, and a sample — BEFORE anything
// is written, so nobody discovers a mis-parse by finding wrong numbers on a
// board slide.
//
// #49: Excel files are accepted (the server reads them through the shared table
// reader), and the three things a file can be missing — the test, the year, the
// grade — become pickers right here instead of an error. The year picker
// replaces a dead end: the preview used to say "set the year when you commit"
// and the commit then refused because there was nowhere to set it.
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
import { TEST_TYPE_KEYS, TEST_TYPE_LABELS } from '../../lib/academicsVocab.js'
import { academicsApi } from '../../lib/api.js'
import Button from '../ui/surface/Button.jsx'
import FileDropZone from '../ui/FileDropZone.jsx'
import '../../styles/pending/a2-carry.css'

/** The same hue as an RGB triple, for `--c-module` (the eyebrow's 2px rule). */
const HUE_VAR = { '--c-module': '13 148 136' }

export const ACCEPT = '.csv,.tsv,.txt,.xlsx,.xls,.pdf,text/csv,text/plain'
const GRADES = ['K', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']

/** This year and the ten before it — a results file is rarely older. */
export function yearOptions(now = new Date()) {
  const y = now.getFullYear() + (now.getMonth() >= 6 ? 1 : 0) // FY ends in June
  return Array.from({ length: 11 }, (_, i) => y - i)
}

/** "How we read your columns" — the roles the parser assigned, used ones first. */
export function columnsLine(columns) {
  const list = Array.isArray(columns) ? columns : []
  const used = list.filter((c) => c.role && c.role !== 'Not used')
  const unused = list.filter((c) => !c.role || c.role === 'Not used').map((c) => c.header)
  return { used, unused }
}

export default function AssessmentUpload({ schoolId, canEdit, onDone }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)
  const [needsType, setNeedsType] = useState(false)
  const [chosenType, setChosenType] = useState('')
  const [chosenYear, setChosenYear] = useState('')
  const [chosenGrade, setChosenGrade] = useState('')

  const reset = () => {
    setFile(null)
    setPreview(null)
    setDone(null)
    setError('')
    setNeedsType(false)
    setChosenType('')
    setChosenYear('')
    setChosenGrade('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const fields = (fd, { testType, year, grade }) => {
    if (testType) fd.append('testType', testType)
    if (year) fd.append('schoolYear', String(year))
    if (grade) fd.append('gradeLevel', grade)
  }

  const doPreview = async (f, { testType = chosenType, year = chosenYear, grade = chosenGrade } = {}) => {
    setBusy(true)
    setError('')
    setDone(null)
    try {
      const fd = new FormData()
      fd.append('file', f)
      fields(fd, { testType, year, grade })
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

  // The ONE way a file arrives — the picker and a drop both call this. A new
  // file forgets the year/grade picked for the last one.
  const chooseFile = (f) => {
    if (!f) return
    setFile(f)
    setChosenYear('')
    setChosenGrade('')
    doPreview(f, { year: '', grade: '' })
  }

  const pickYear = (y) => {
    setChosenYear(y)
    if (file && y) doPreview(file, { year: y })
  }
  const pickGrade = (g) => {
    setChosenGrade(g)
    if (file && g) doPreview(file, { grade: g })
  }

  const yearToSave = chosenYear || preview?.years?.[0] || ''
  const canSave = !!preview && !busy && !(preview.needsYear && !yearToSave) && !(preview.needsGrade && !chosenGrade)

  const doCommit = async () => {
    if (!file || !canSave) return
    setBusy(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', file)
      fields(fd, { testType: chosenType || preview?.testType, year: yearToSave, grade: chosenGrade })
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
  const cols = columnsLine(preview?.columns)

  return (
    <div style={HUE_VAR}>
      <p className="a2-eyebrow">
        Assessment scores
      </p>
      <h3 className="a2-title">Upload a results file</h3>
      <p className="mt-1 max-w-[70ch] text-small text-ink2">
        A diocesan summary, a publisher export, or a student-level file — Excel or CSV. Title rows and odd column
        names are handled; if the file doesn’t say which test, year or grade it is, you’ll pick that here. You will
        see exactly what was read before anything is saved.
      </p>

      {/* Drop or choose — both run chooseFile (owner 2026-10-25: "like the finance module"). */}
      <FileDropZone
        className="mt-4"
        testId="assessment-drop"
        inputRef={inputRef}
        accept={ACCEPT}
        busy={busy}
        fileName={file?.name}
        title={file ? 'Drop another Excel or CSV file here, or choose one' : 'Drop an Excel or CSV file here, or choose one'}
        ariaLabel="Choose an assessment results file"
        hint="Excel, CSV or a PDF export · one results file at a time"
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
              {[
                ['Shape', preview.scope === 'student' ? 'Student-level' : 'School summary'],
                ['Test', (preview.testType ?? '').toUpperCase()],
                ['Score', preview.scoreType === 'percentile' ? 'National percentile' : 'Scale score'],
                ['Years', (preview.years ?? []).join(', ') || (chosenYear ? String(chosenYear) : '—')],
                ['Rows', preview.rows],
                ['Subjects', (preview.subjects ?? []).length],
              ].map(([k, v]) => (
                <span key={k} className="a2-fact">
                  <b>{k}</b>
                  <span>{v}</span>
                </span>
              ))}
            </div>

            {cols.used.length > 0 ? (
              <p className="mt-3 text-small text-ink2" data-testid="assessment-columns">
                How we read your columns:{' '}
                {cols.used.map((c, i) => (
                  <span key={c.header}>
                    {i > 0 && ' · '}
                    <b className="font-medium text-ink">{c.header}</b> → {c.role}
                  </span>
                ))}
                {cols.unused.length > 0 ? <span> · not used: {cols.unused.join(', ')}</span> : null}
              </p>
            ) : null}

            {preview.match ? (
              <p className="mt-3 text-small text-ink2">
                Roster match: <b className="tabular-nums text-ink">{preview.match.matched}</b> matched,{' '}
                {preview.match.unmatched} unmatched
                {preview.match.ambiguous > 0 ? ` (${preview.match.ambiguous} ambiguous — left unattached on purpose)` : ''}.
              </p>
            ) : null}

            {/* The things the file didn't say — pickers, not errors. */}
            {preview.needsYear || preview.needsGrade ? (
              <div className="mt-3 flex flex-wrap items-center gap-3" data-testid="assessment-pickers">
                {preview.needsYear ? (
                  <label className="flex items-center gap-2 text-small text-ink">
                    <span>This file doesn’t say the year — which school year is it?</span>
                    <select
                      aria-label="School year"
                      value={chosenYear}
                      onChange={(e) => pickYear(e.target.value)}
                      className="a2-field" style={{ width: 'auto', minWidth: '8rem' }}
                    >
                      <option value="">Choose a year…</option>
                      {yearOptions().map((y) => (
                        <option key={y} value={y}>{`${y - 1}–${String(y).slice(2)}`}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
                {preview.needsGrade ? (
                  <label className="flex items-center gap-2 text-small text-ink">
                    <span>No grade column — which grade are these students in?</span>
                    <select
                      aria-label="Grade"
                      value={chosenGrade}
                      onChange={(e) => pickGrade(e.target.value)}
                      className="a2-field" style={{ width: 'auto', minWidth: '7rem' }}
                    >
                      <option value="">Choose a grade…</option>
                      {GRADES.map((g) => (
                        <option key={g} value={g}>{g === 'K' ? 'Kindergarten' : `Grade ${g}`}</option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            ) : null}

            {(preview.warnings ?? [])
              .filter((w) => !(preview.needsYear && /No year column/.test(w)))
              .map((w) => (
                <p key={w} className="a2-note mt-2" data-tone="watch">
                  <AlertTriangle size={13} aria-hidden /> {w}
                </p>
              ))}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" onClick={doCommit} disabled={!canSave}>
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
            <Button variant="primary" disabled={!chosenType || busy} onClick={() => doPreview(file, { testType: chosenType })}>
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
