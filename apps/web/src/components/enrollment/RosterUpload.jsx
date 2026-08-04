// ─────────────────────────────────────────────────────────────────────────────
// RosterUpload — the ONE-STEP roster path (always available, no live SIS
// needed). Drop a OneRoster ZIP or a CSV, pick merge/replace, optionally stamp
// an as-of date, then CONFIRM to send it. The server now does the WHOLE job in
// one call: a student record for every row that carries per-student detail, plus
// the enrollment count for the period the FILE is dated to. It returns
//   { snapshot, promoted, superseded?, supersededManual?, warnings, reason?,
//     records: {created,updated,deleted,total} | null, recordsNote: string|null,
//     enrollment: {value, source, fiscalPeriodId, periodLabel} | null }
// and we render that as the applied panel, so the user sees exactly what landed.
//
// EVERY EXPLANATION ON THIS PANEL IS THE SERVER'S. `recordsNote` says why nothing
// reached Records, `reason` says why the number did not move, and `periodLabel`
// names the year that was written — this panel used to infer all three, and got
// each of them wrong in a way that read like success.
//
// WHY THE PANEL IS TWO SENTENCES. Production report: a head of school uploaded a
// 436-student roster, was told "Imported 436 students", and found Records empty.
// The count had landed; not one student row had. One upload now has two
// independent outcomes, so the panel states them separately — what was CREATED,
// and what happened to this period's ENROLLMENT (replaced a number you typed /
// set / left alone). The branch decision is derived from the response in
// rosterUploadSummary.js so it can be tested; a field the server did not send
// produces no claim at all.
//
// React 19 idioms: no sync setState in effects, loading/error/empty on the call.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertTriangle,
  X,
  Users,
  Undo2,
  GraduationCap,
} from 'lucide-react'
import { enrollmentApi, apiErrorMessage } from '../../lib/api.js'
import { FormError, FormSuccess } from '../auth/fields.jsx'
import ByGradeChart from './ByGradeChart.jsx'
import DatePicker from '../ui/DatePicker.jsx'
import { summarizeRosterUpload } from './rosterUploadSummary.js'

const inputCls =
  'w-full rounded-lg border-2 border-border bg-white px-4 py-3 text-base text-ink outline-none transition-colors focus:border-gold disabled:cursor-not-allowed disabled:bg-navy/[0.04] disabled:text-muted'

const MODES = [
  ['merge', 'Merge', 'Update students already on file, add the rest'],
  ['replace', 'Replace', 'Swap the whole roster for this file'],
]

export default function RosterUpload({
  schoolId,
  canEdit,
  onApplied,
  activePeriodLabel = '',
  periods = [],
}) {
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [observedOn, setObservedOn] = useState('')
  // ── WHICH YEAR DOES THIS ROSTER COUNT FOR ────────────────────────────────────
  // Asked, not inferred. The year used to be DERIVED from the as-of date, which
  // defaults to today; the fiscal year runs Jul-Jun, so an August upload landed in
  // the NEXT year. A real school's 436 students went to FY 2027 while their ledger
  // and every finance metric sat in FY 2026, still computing from a hand-entered
  // 1200 — cost per pupil $8,683 against 1200 versus $23,899 against 436.
  //
  // The date STAYS, and is not merely cosmetic: it positions the reading on the
  // time axis, it is the idempotency key, and the enrollment trend is drawn from
  // several readings inside one year (September's official count, January's,
  // May's). Folding the two together would make a second upload overwrite the
  // first and flatten the trend to a single point.
  // `periods` arrives as a PROP, not from usePersistence: this component is
  // mounted bare in its own specs and from two different places, and reaching for
  // a provider here would couple a leaf to a context its tests do not mount. An
  // empty list simply hides the control and falls back to the date-derived year.
  const periodList = Array.isArray(periods) ? periods : []
  // Default to the year that HAS a ledger — the one where this upload will
  // actually move a number — falling back to the newest.
  const [fiscalPeriodId, setFiscalPeriodId] = useState('')
  const defaultPeriodId =
    periodList.find((p) => p.hasSnapshot)?.id ?? periodList[0]?.id ?? ''
  const chosenPeriodId = fiscalPeriodId || defaultPeriodId
  const [mode, setMode] = useState('merge')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [result, setResult] = useState(null)
  const [dragOver, setDragOver] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [restored, setRestored] = useState(false)
  const [restoreErr, setRestoreErr] = useState('')

  const pickFile = (f) => {
    setErr('')
    setResult(null)
    setRestored(false)
    setRestoreErr('')
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
    setRestored(false)
    setRestoreErr('')
    try {
      const form = new FormData()
      form.append('file', file)
      form.append('mode', mode)
      if (observedOn) form.append('observedOn', observedOn)
      // Sent only when we actually have one, so a mount with no periods degrades
      // to exactly the previous date-derived behaviour.
      if (chosenPeriodId) form.append('fiscalPeriodId', chosenPeriodId)
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
  const summary = useMemo(() => (result ? summarizeRosterUpload(result) : null), [result])

  // Decision 2's other half: an explicit upload supersedes a hand-entered
  // figure, and the panel that overwrote it is where the undo lives.
  const restore = async () => {
    const periodId = summary?.enrollment.restorePeriodId
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
      <p className="mb-3 text-[14.5px] leading-relaxed text-muted">
        Upload a <span className="font-semibold text-navy">OneRoster export</span> (a ZIP of the
        standard CSVs) or a single roster CSV. We save a student record for every row it names, and
        count active students by grade — never a per-class over-count — to set this period&apos;s
        enrollment. One step, both outcomes.
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

          {/* Merge / replace — the same two words, and the same meaning, as the
              reviewed importer. This upload writes student rows now, so the
              question it has always answered there has to be asked here too. */}
          <div className="mt-3 flex flex-wrap items-start gap-4">
            {MODES.map(([value, label, blurb]) => (
              <label key={value} className="flex cursor-pointer select-none items-start gap-2">
                <input
                  type="radio"
                  name="roster-upload-mode"
                  value={value}
                  checked={mode === value}
                  onChange={() => setMode(value)}
                  className="mt-0.5 h-4 w-4 accent-gold"
                />
                <span>
                  <span className="block text-[13.5px] font-semibold text-navy">{label}</span>
                  <span className="block text-[11.5px] text-muted">{blurb}</span>
                </span>
              </label>
            ))}
          </div>
          {/* The old wording — "only the students in this file survive" — was not
              true: rows we cannot read (an unmapped grade code, a missing name, a
              repeated id) are dropped from the import, and replace deleted the
              register anyway, so students the file NAMES disappeared. There is no
              preview on this path to catch it, so the server now refuses a replace
              that would drop any row, and this says both halves. */}
          {mode === 'replace' && (
            <p className="mt-2 flex items-start gap-1.5 text-[12.5px] font-semibold text-amber-700">
              <AlertTriangle size={13} className="mt-[2px] shrink-0" />
              <span>
                Replace deletes every current student first — only the rows we can read from this
                file survive. If any row cannot be read, nothing is deleted and we tell you which:
                merge, or use the import with a review step, to fix them first.
              </span>
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-end gap-3">
            {/* THE YEAR LEADS, because it is the decision that determines whether
                this upload changes any finance number. Each option says whether
                that year has a ledger, so "will this move my numbers" is answered
                BEFORE the upload instead of explained afterwards. */}
            {periodList.length > 0 && (
              <label className="text-[13px] font-semibold text-muted">
                Counts for
                <select
                  value={chosenPeriodId}
                  onChange={(e) => setFiscalPeriodId(e.target.value)}
                  className={`${inputCls} mt-1 max-w-[280px]`}
                >
                  {periodList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                      {p.hasSnapshot ? ' · has your financials' : ' · no financials yet'}
                    </option>
                  ))}
                </select>
              </label>
            )}
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

      {/* Applied panel — WHAT WAS SAVED, and WHAT HAPPENED TO THE NUMBER.
          Two facts, two sentences, both read off the response. The bug this
          layout exists to prevent is a single reassuring sentence covering an
          outcome that did not occur. */}
      {summary && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 space-y-3"
        >
          <FormSuccess>
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2 size={15} />
              {summary.file.line ?? 'Roster file read.'}
            </span>
          </FormSuccess>

          {/* 1 — records */}
          <div className="rounded-lg border border-rule/60 bg-section px-4 py-3">
            <p className="flex items-start gap-2 text-[13.5px] font-semibold text-navy">
              <GraduationCap size={15} className="mt-[1px] shrink-0 text-gold" />
              {summary.recordsLine}
            </p>
            {summary.records ? (
              <Link
                to="/enrollment?tab=records"
                className="mt-2.5 inline-flex items-center gap-1.5 rounded-full btn-cta px-3.5 py-1.5 text-[13px] font-semibold transition"
              >
                <Users size={14} aria-hidden /> Open Records
              </Link>
            ) : (
              // The cause comes from the SERVER. This used to key on whether any
              // warning existed at all, so a counts-only file that also had an odd
              // grade code was told "the notes below say why" while the notes said
              // nothing about it — and the one true sentence was unreachable.
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                {summary.recordsNote ?? 'The notes below say why.'}
              </p>
            )}
          </div>

          {/* 2 — the enrollment for the period THAT WAS WRITTEN (named, when the
              server sent a label: a June file uploaded in August lands in the year
              it describes, which is not the year on screen). Once the undo runs,
              the lead line is REPLACED — appending "Restored" under "Replaced your
              entered enrollment of 430 with 436" leaves the false sentence on top. */}
          <div className="rounded-lg border border-rule/60 bg-section px-4 py-3">
            <p className="text-[13.5px] font-semibold text-navy">
              {(restored && summary.enrollment.restoredLine) || summary.enrollment.line}
            </p>
            {summary.enrollment.reason && !restored && (
              <p className="mt-1 text-[13px] leading-relaxed text-muted">
                {summary.enrollment.reason}
              </p>
            )}
            {/* DID THIS CHANGE MY NUMBERS? — the question behind the report.
                The as-of date defaults to TODAY and the fiscal year runs Jul-Jun,
                so an August upload is filed under the NEXT year, which routinely
                has no ledger yet. Verified on the reporter's own data: 436 students
                landed in FY 2027 while every finance metric sat in FY 2026 and kept
                computing from a hand-entered 1200 — cost per pupil $8,683 against
                1200 versus $23,899 against 436.

                The flag is SERVER-AUTHORED. My first attempt compared against the
                period label in the wizard's context and was INERT: that screen
                resolves no period, so the warning never rendered in the one place
                it was needed. The server knows from every entry point.

                We do NOT retarget the period: a roster dated today genuinely is
                next year's roster, and quietly filing it elsewhere would be the
                same guess this product refuses to make. We say so, and name the fix. */}
            {summary.enrollment.periodHasFinancials === false ? (
              <div className="mt-2.5 rounded-lg border border-gold/50 bg-gold/10 px-3 py-2.5">
                <p className="text-[13px] font-semibold text-[#7a5e00]">
                  No finance metric changed
                  {summary.enrollment.periodLabel ? ` — ${summary.enrollment.periodLabel} has no financials yet` : ''}.
                </p>
                <p className="mt-1 text-[12.5px] leading-relaxed text-[#7a5e00]/90">
                  Your roster is saved and this year&apos;s enrollment is recorded. But cost
                  per pupil, net tuition per student, aid per student and the
                  student-teacher ratio all divide by the enrollment of the year their
                  ledger is in — and this year has no trial balance yet. The as-of date
                  decides the year, and it defaults to today. To count this roster against
                  a year you already have financials for, upload it again with an as-of
                  date inside that year.
                </p>
              </div>
            ) : null}
            {summary.enrollment.branch === 'superseded' && summary.enrollment.restorePeriodId && (
              <div className="mt-2.5">
                {restored ? (
                  <p className="text-[13px] font-semibold text-emerald-700">
                    Restored — your number is the one in force.
                  </p>
                ) : (
                  <button
                    type="button"
                    onClick={restore}
                    disabled={restoring}
                    className="inline-flex items-center gap-1.5 rounded-full border border-rule/70 bg-white px-3.5 py-1.5 text-[13px] font-semibold text-navy transition hover:border-navy/40 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Undo2 size={14} aria-hidden />
                    {restoring ? 'Restoring…' : 'Restore my number'}
                  </button>
                )}
                {restoreErr && <p className="mt-1 text-[13px] text-danger">{restoreErr}</p>}
              </div>
            )}
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
          {snapshot && <ByGradeChart byGrade={snapshot.byGrade} />}
        </motion.div>
      )}
    </div>
  )
}
