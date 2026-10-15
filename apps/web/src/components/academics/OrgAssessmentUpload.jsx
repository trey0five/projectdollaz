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
// the dropzone is a dashed hairline on the ground at the panel radius
// (keyboard-reachable: the file input is sr-only, not display:none), the eyebrow
// is ink over a 2px module-hue rule, the preview is a hairline-ruled block of
// key/value facts, notes carry a 2px semantic mark, and actions are flat Buttons.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, CheckCircle2, FileUp, Loader2, MinusCircle } from 'lucide-react'
import { academicsApi } from '../../lib/api.js'
import Button from '../ui/surface/Button.jsx'
import Panel from '../ui/surface/Panel.jsx'
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

  const reset = () => {
    setFile(null)
    setPreview(null)
    setDone(null)
    setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const run = async (f, commit = false) => {
    setBusy(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('file', f)
      if (commit && preview?.testType) fd.append('testType', preview.testType)
      const res = commit ? await academicsApi.orgCommit(orgId, fd) : await academicsApi.orgPreview(orgId, fd)
      const body = res.data ?? res
      if (commit) {
        setDone(body)
        setPreview(null)
        onDone?.()
      } else {
        setPreview(body)
        setDone(null)
      }
    } catch (e) {
      setError(e?.response?.data?.message ?? (commit ? 'Could not save those results.' : 'Could not read that file.'))
      if (!commit) setPreview(null)
    } finally {
      setBusy(false)
    }
  }

  // Keyed to what orgPreview ACTUALLY returns: schools[] of
  // { sourceName, schoolId, matchedName, decision, rows }.
  const matches = preview?.schools ?? []
  const unmatched = matches.filter((m) => !m.schoolId)

  return (
    <Panel style={HUE_VAR}>
      {/* The Aurora section strip above names this ("One file, every school");
          the card keeps one plain line and the dropzone. */}
      <p className="max-w-[70ch] text-small text-ink2" title="School names are matched against your records — including the spellings you have already corrected once — and you see every match before anything is saved.">
        The publisher&rsquo;s export, as it arrives. You see every school match before anything is saved.
      </p>

      <label
        className="a2-drop mt-4 cursor-pointer items-center gap-3 px-4 py-4"
      >
        <FileUp size={20} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-small text-ink">{file ? file.name : 'Choose a CSV file…'}</span>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (!f) return
            setFile(f)
            run(f, false)
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
              <Button variant="primary" onClick={() => file && run(file, true)} disabled={busy}>
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
      {error ? (
        <p className="a2-note mt-3" data-tone="risk">
          {error}
        </p>
      ) : null}
    </Panel>
  )
}
