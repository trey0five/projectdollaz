// ─────────────────────────────────────────────────────────────────────────────
// RosterUpload — the universal roster file path (always available, no live SIS
// needed). Drop a OneRoster ZIP or a CSV, optionally stamp an as-of date, then
// CONFIRM to send it. The server parses + promotes in one call and returns the
// parsed snapshot ({ snapshot:{observedOn,totalEnrolled,byGrade}, promoted, warnings });
// we render that as the applied preview so the user sees exactly what landed.
// React 19 idioms: no sync setState in effects, loading/error/empty on the call.
// ─────────────────────────────────────────────────────────────────────────────
import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { UploadCloud, FileText, CheckCircle2, AlertTriangle, X, Users } from 'lucide-react'
import { enrollmentApi, apiErrorMessage } from '../../lib/api.js'
import { FormError, FormSuccess } from '../auth/fields.jsx'
import ByGradeChart from './ByGradeChart.jsx'
import DatePicker from '../ui/DatePicker.jsx'

const inputCls =
  'w-full rounded-lg border-2 border-border bg-white px-4 py-3 text-base text-ink outline-none transition-colors focus:border-gold disabled:cursor-not-allowed disabled:bg-navy/[0.04] disabled:text-muted'

export default function RosterUpload({ schoolId, canEdit, onApplied }) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [observedOn, setObservedOn] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState(null)
  const [dragOver, setDragOver] = useState(false)

  const pickFile = (f) => {
    setErr('')
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

  const apply = async () => {
    if (!file || !schoolId) return
    setBusy(true)
    setErr('')
    try {
      const form = new FormData()
      form.append('file', file)
      if (observedOn) form.append('observedOn', observedOn)
      const res = await enrollmentApi.upload(schoolId, form)
      setResult(res.data ?? res)
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      onApplied?.()
    } catch (e) {
      setErr(apiErrorMessage(e, 'Could not read that roster file. Check it is a OneRoster ZIP or CSV.'))
    } finally {
      setBusy(false)
    }
  }

  const snapshot = result?.snapshot ?? null
  const warnings = result?.warnings ?? []

  return (
    <div>
      <p className="mb-3 text-[14.5px] leading-relaxed text-muted">
        Upload a <span className="font-semibold text-navy">OneRoster export</span> (a ZIP of the
        standard CSVs) or a single roster CSV. We count active students by grade — never a per-class
        over-count — and update this period&apos;s enrollment.
      </p>

      {/* Dropzone — ALWAYS available, connection or not. */}
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (canEdit) setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-6 py-8 text-center transition-colors ${
          dragOver ? 'border-gold bg-gold/[0.06]' : 'border-border bg-section/40'
        } ${canEdit ? '' : 'opacity-60'}`}
      >
        <UploadCloud size={26} className="mb-2 text-gold" />
        <p className="text-[15px] font-semibold text-navy">
          Drop a roster file here{canEdit ? ', or' : ''}
        </p>
        {canEdit && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="mt-2 inline-flex items-center gap-1.5 rounded-lg border-2 border-gold/50 bg-gold/10 px-4 py-2 text-[14px] font-semibold text-navy transition-all hover:border-gold hover:bg-gold/20"
          >
            <FileText size={15} /> Choose file
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".zip,.csv"
          className="hidden"
          onChange={(e) => pickFile(e.target.files?.[0])}
        />
        <p className="mt-2 text-[12.5px] text-muted">OneRoster ZIP or CSV · up to a few MB</p>
      </div>

      {/* Selected-file confirm bar (confirm-then-apply). */}
      {file && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 rounded-lg border-2 border-gold/40 bg-gold/[0.06] px-4 py-3.5"
        >
          <p className="flex items-center gap-2 text-[15px] font-semibold text-navy">
            <FileText size={16} className="shrink-0 text-gold" />
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
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-[13px] font-semibold text-muted">
              As-of date (optional)
              <DatePicker
                value={observedOn}
                onChange={(v) => setObservedOn(v)}
                className={`${inputCls} mt-1 max-w-[200px]`}
              />
            </label>
            <button
              type="button"
              onClick={apply}
              disabled={busy}
              className="btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <UploadCloud size={15} className={busy ? 'animate-pulse' : ''} />
              {busy ? 'Reading…' : 'Confirm & apply roster'}
            </button>
          </div>
        </motion.div>
      )}

      {err && <div className="mt-3"><FormError>{err}</FormError></div>}

      {/* Applied preview — the parsed snapshot the server returned. */}
      {snapshot && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 space-y-3"
        >
          {/* WHAT THIS UPLOAD ACTUALLY DID, and why the sentence changed.
              This pipeline is COUNTS-ONLY: parseOneRosterCsv aggregates into
              byGrade as it reads and never keeps a student row, and the service
              only ever calls prisma.student.count — it creates none. The old
              copy said "Imported N students", which reads as "N student records
              now exist". A head of school then opened Records, found it empty,
              and reasonably concluded the upload had silently lost their data.
              Counting students is not importing them, and the sentence now says
              which of the two happened. */}
          <FormSuccess>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 size={15} />
              Enrollment counted — {snapshot.totalEnrolled?.toLocaleString('en-US')} students
              {snapshot.observedOn ? ` as of ${snapshot.observedOn}` : ''}
              {result?.promoted ? ' · this period’s enrollment updated' : ''}.
            </span>
          </FormSuccess>
          {/* The follow-on the old copy left the reader to discover by failing.
              Named here rather than in a tooltip: the reader has just formed the
              belief that their roster is saved, and this is the only moment they
              are looking at the thing that would correct it. */}
          <div className="rounded-lg border border-rule/60 bg-section px-4 py-3">
            <p className="text-[13.5px] font-semibold text-navy">
              This did not create student records.
            </p>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              Your enrollment totals and grade breakdown are saved and now feed the
              dashboard, analytics and the accreditation signals. Individual student
              rows — the roster you can open, filter and report on — come from the
              student import, which is a separate step.
            </p>
            <Link
              to="/enrollment?tab=records"
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-full btn-cta px-3.5 py-1.5 text-[13px] font-semibold transition"
            >
              <Users size={14} aria-hidden /> Import the student roster
            </Link>
          </div>
          {warnings.length > 0 && (
            <div className="rounded-lg border border-gold/40 bg-gold/10 px-4 py-3">
              <p className="flex items-center gap-1.5 text-[13.5px] font-semibold text-[#7a5e00]">
                <AlertTriangle size={14} /> {warnings.length} warning
                {warnings.length === 1 ? '' : 's'} while reading the file
              </p>
              <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-[13px] text-muted">
                {warnings.slice(0, 6).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <ByGradeChart byGrade={snapshot.byGrade} />
        </motion.div>
      )}
    </div>
  )
}
