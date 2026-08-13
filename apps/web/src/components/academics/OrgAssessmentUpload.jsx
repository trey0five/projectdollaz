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
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, CheckCircle2, FileUp, Loader2, MinusCircle } from 'lucide-react'
import { academicsApi } from '../../lib/api.js'
import { testTypeLabel } from '../../lib/academicsVocab.js'

const HUE = '#0D9488'

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
    <div className="rounded-2xl border border-navy/10 bg-white p-5">
      <p className="font-mono text-[9.5px] font-bold uppercase tracking-[0.18em]" style={{ color: HUE }}>
        One file, every school
      </p>
      <h3 className="mt-0.5 font-serif text-[19px] font-semibold text-navy">Upload the network&rsquo;s results</h3>
      <p className="mt-1 text-[12.5px] text-muted">
        The publisher&rsquo;s export, exactly as it arrives. School names are matched against your records — including
        the spellings you have already corrected once — and you see every match before anything is saved.
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
            run(f, false)
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
              {[
                ['Test', testTypeLabel(preview.testType)],
                ['Years', (preview.years ?? []).join(', ') || '—'],
                ['Rows', preview.rows ?? 0],
                ['Schools matched', matches.length - unmatched.length],
              ].map(([k, v]) => (
                <span key={k} className="rounded-lg bg-white px-2.5 py-1 text-[11.5px] ring-1 ring-navy/10">
                  <b className="font-mono text-[9px] uppercase tracking-wider text-muted">{k}</b>{' '}
                  <span className="font-semibold text-navy">{v}</span>
                </span>
              ))}
            </div>

            {matches.length > 0 ? (
              <div className="mt-3 space-y-1">
                {matches.map((m) => (
                  <div key={m.sourceName} className="flex items-center gap-2 text-[12px]">
                    {m.schoolId ? (
                      <CheckCircle2 size={13} className="shrink-0 text-emerald-600" />
                    ) : (
                      <MinusCircle size={13} className="shrink-0 text-amber-600" />
                    )}
                    <span className="text-navy">{m.sourceName}</span>
                    <span className="font-mono text-[10.5px] text-muted">{m.rows} row{m.rows === 1 ? '' : 's'}</span>
                    {m.schoolId ? (
                      <span className="text-muted">→ {m.matchedName ?? 'matched'}</span>
                    ) : (
                      <span className="text-amber-700">
                        {m.decision === 'not-permitted'
                          ? 'you cannot write to this school'
                          : 'no confident match — these rows are skipped'}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            ) : null}

            {(preview.warnings ?? []).map((w) => (
              <p key={w} className="mt-2 flex items-start gap-1.5 text-[12px] text-amber-700">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {w}
              </p>
            ))}

            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => file && run(file, true)}
                disabled={busy}
                className="rounded-xl px-4 py-2 text-[12px] font-bold uppercase tracking-[0.12em] text-white disabled:opacity-50"
                style={{ background: HUE }}
              >
                Save to {matches.length - unmatched.length} school
                {matches.length - unmatched.length === 1 ? '' : 's'}
              </button>
              <button type="button" onClick={reset} className="rounded-xl border border-navy/15 px-4 py-2 text-[12px] text-navy">
                Cancel
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      {done ? (
        <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-emerald-700">
          <CheckCircle2 size={14} /> Saved — {done.aggregatesUpserted ?? 0} rows across {done.schoolsTouched ?? 0} school
          {done.schoolsTouched === 1 ? '' : 's'}
          {done.skipped > 0
            ? `. ${done.skipped} row${done.skipped === 1 ? '' : 's'} skipped: ${(done.unresolvedSchools ?? []).join(', ')}.`
            : '.'}
        </p>
      ) : null}
      {error ? <p className="mt-3 text-[12.5px] text-danger">{error}</p> : null}
    </div>
  )
}
