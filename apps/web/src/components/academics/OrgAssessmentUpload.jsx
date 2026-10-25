// ─────────────────────────────────────────────────────────────────────────────
// OrgAssessmentUpload — one file, every school.
//
// This is what a diocese actually receives from a test publisher: a single
// export with every school in it. Uploading it school by school means opening
// twenty tabs and splitting a spreadsheet by hand, which is exactly the work the
// module exists to remove.
//
// The preview matters more here than on the school page, because the risky step
// is NAME MATCHING: the file says "St. Mary's" and the record says "Saint Mary
// School". The server resolves those against the org's schools with the same
// matcher (and the same learned aliases) the enrollment import uses, and the
// preview shows every decision before a single row is written — including the
// ones it refused to make.
//
// PREMIUM UI P4 (a2): the org academics page mounts this bare, so it IS the
// Panel (an upload is actionable). Inside it:
// the dropzone is the shared FileDropZone — a dashed hairline that takes a drop
// or a click (keyboard-reachable: the file input is sr-only, not display:none), the eyebrow
// is ink over a 2px module-hue rule, the preview is a hairline-ruled block of
// key/value facts, notes carry a 2px semantic mark, and actions are flat Buttons.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, CheckCircle2, MinusCircle } from 'lucide-react'
import { academicsApi } from '../../lib/api.js'
import { TEST_TYPE_KEYS, TEST_TYPE_LABELS } from '../../lib/academicsVocab.js'
import { ACCEPT, yearOptions } from './AssessmentUpload.jsx'
import Button from '../ui/surface/Button.jsx'
import Panel from '../ui/surface/Panel.jsx'
import FileDropZone from '../ui/FileDropZone.jsx'
import '../../styles/pending/a2-carry.css'
import { testTypeLabel } from '../../lib/academicsVocab.js'

/** The same hue as an RGB triple, for `--c-module` (the eyebrow's 2px rule). */
const HUE_VAR = { '--c-module': '13 148 136' }

export default function OrgAssessmentUpload({ orgId, onDone }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(null)
  // #49: the test, the year — pickers, not dead ends (the school uploader's idiom).
  const [needsType, setNeedsType] = useState(false)
  const [chosenType, setChosenType] = useState('')
  const [chosenYear, setChosenYear] = useState('')

  const reset = () => {
    setFile(null)
    setPreview(null)
    setDone(null)
    setError('')
    setNeedsType(false)
    setChosenType('')
    setChosenYear('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const run = async (f, commit = false, { testType = chosenType, year = chosenYear } = {}) => {
    setBusy(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', f)
      const type = testType || (commit ? preview?.testType : '')
      if (type) fd.append('testType', type)
      const y = year || (commit ? preview?.years?.[0] : '')
      if (y) fd.append('schoolYear', String(y))
      const res = commit ? await academicsApi.orgCommit(orgId, fd) : await academicsApi.orgPreview(orgId, fd)
      const body = res.data ?? res
      if (commit) {
        setDone(body)
        setPreview(null)
        onDone?.()
      } else {
        setPreview(body)
        setDone(null)
        setNeedsType(false)
      }
    } catch (e) {
      const message = e?.response?.data?.message ?? (commit ? 'Could not save those results.' : 'Could not read that file.')
      setError(message)
      if (!commit) {
        setPreview(null)
        setNeedsType(/which test/i.test(message))
      }
    } finally {
      setBusy(false)
    }
  }

  // The ONE way a file arrives — the picker and a drop both call this.
  const chooseFile = (f) => {
    if (!f) return
    setFile(f)
    setChosenYear('')
    run(f, false, { year: '' })
  }

  // Keyed to what orgPreview ACTUALLY returns: schools[] of
  // { sourceName, schoolId, matchedName, decision, rows }.
  const matches = preview?.schools ?? []
  const unmatched = matches.filter((m) => !m.schoolId)
  const canSave = !!preview && !busy && !(preview.needsYear && !chosenYear)

  return (
    <Panel style={HUE_VAR}>
      {/* The Aurora section strip above names this ("One file, every school");
          the card keeps one plain line and the dropzone. */}
      <p className="max-w-[70ch] text-small text-ink2" title="School names are matched against your records — including the spellings you have already corrected once — and you see every match before anything is saved.">
        The publisher&rsquo;s export, as it arrives. You see every school match before anything is saved.
      </p>

      {/* Drop or choose — both run chooseFile (owner 2026-10-25: "like the finance module"). */}
      <FileDropZone
        className="mt-4"
        testId="org-assessment-drop"
        inputRef={inputRef}
        accept={ACCEPT}
        busy={busy}
        fileName={file?.name}
        title={file ? 'Drop another Excel or CSV file here, or choose one' : 'Drop an Excel or CSV file here, or choose one'}
        ariaLabel="Choose the network results file"
        hint="Excel, CSV or a PDF export · the whole file, every school in it"
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
                ['Test', testTypeLabel(preview.testType)],
                ['Years', (preview.years ?? []).join(', ') || '—'],
                ['Rows', preview.rows ?? 0],
                ['Schools matched', matches.length - unmatched.length],
              ].map(([k, v]) => (
                <span key={k} className="a2-fact">
                  <b>{k}</b>
                  <span>{v}</span>
                </span>
              ))}
            </div>

            {preview.needsYear ? (
              <label className="mt-3 flex flex-wrap items-center gap-2 text-small text-ink" data-testid="org-year-picker">
                <span>This file doesn’t say the year — which school year is it?</span>
                <select
                  aria-label="School year"
                  value={chosenYear}
                  onChange={(e) => {
                    setChosenYear(e.target.value)
                    if (file && e.target.value) run(file, false, { year: e.target.value })
                  }}
                  className="a2-field" style={{ width: 'auto', minWidth: '8rem' }}
                >
                  <option value="">Choose a year…</option>
                  {yearOptions().map((y) => (
                    <option key={y} value={y}>{`${y - 1}–${String(y).slice(2)}`}</option>
                  ))}
                </select>
              </label>
            ) : null}

            {matches.length > 0 ? (
              <ul className="a2-rows a2-rows-tight mt-3">
                {matches.map((m) => (
                  <li key={m.sourceName} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-small">
                    <i
                      aria-hidden="true"
                      className={`mark ${m.schoolId ? 'tone-good' : 'tone-watch'}`}
                    />
                    {m.schoolId ? (
                      <CheckCircle2 size={13} className="shrink-0 text-ink2" aria-label="Matched" />
                    ) : (
                      <MinusCircle size={13} className="shrink-0 text-ink2" aria-label="Not matched" />
                    )}
                    <span className="font-semibold text-ink">{m.sourceName}</span>
                    <span className="text-[12px] tabular-nums text-ink2">{m.rows} row{m.rows === 1 ? '' : 's'}</span>
                    {m.schoolId ? (
                      <span className="text-ink2">→ {m.matchedName ?? 'matched'}</span>
                    ) : (
                      <span className="text-ink">
                        {m.decision === 'not-permitted'
                          ? 'you cannot write to this school'
                          : 'no confident match — these rows are skipped'}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}

            {(preview.warnings ?? []).map((w) => (
              <p key={w} className="a2-note mt-2" data-tone="watch">
                <AlertTriangle size={13} aria-hidden /> {w}
              </p>
            ))}

            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" onClick={() => file && run(file, true)} disabled={!canSave}>
                Save to {matches.length - unmatched.length} school
                {matches.length - unmatched.length === 1 ? '' : 's'}
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
          <CheckCircle2 size={14} aria-hidden /> Saved — {done.aggregatesUpserted ?? 0} rows across {done.schoolsTouched ?? 0} school
          {done.schoolsTouched === 1 ? '' : 's'}
          {done.skipped > 0
            ? `. ${done.skipped} row${done.skipped === 1 ? '' : 's'} skipped: ${(done.unresolvedSchools ?? []).join(', ')}.`
            : '.'}
        </p>
      ) : null}
      {needsType && file ? (
        <div className="a2-block" data-testid="org-test-picker">
          <p className="a2-note" data-tone="watch">
            Nothing in this file names the test. Choose it and we will read the file again.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              aria-label="Test type"
              value={chosenType}
              onChange={(e) => setChosenType(e.target.value)}
              className="a2-field" style={{ width: 'auto', minWidth: '14rem', maxWidth: '100%' }}
            >
              <option value="">Choose a test…</option>
              {TEST_TYPE_KEYS.map((k) => (
                <option key={k} value={k}>{TEST_TYPE_LABELS[k] ?? k.toUpperCase()}</option>
              ))}
            </select>
            <Button variant="primary" disabled={!chosenType || busy} onClick={() => run(file, false, { testType: chosenType })}>
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
    </Panel>
  )
}
