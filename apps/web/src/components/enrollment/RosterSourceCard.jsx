// ─────────────────────────────────────────────────────────────────────────────
// RosterSourceCard — "where did these numbers come from, and what did they do?"
//
// Two reports produced this component, and they were the same report:
//   "I added a roster but the student roster is still blank."
//   "There isn't anywhere to edit, delete, or see the current file used for the
//    roster being shown on the overview."
//
// Both were true, and neither was answerable from the product. The Enrollment
// page showed a headcount of 436 over an empty register and said nothing about
// the gap — the KPI cards read "Needs the student roster" without ever mentioning
// that a roster file HAD been uploaded and had produced no records. And the
// uploaded filename was never stored at all, so there was nothing to display even
// if a screen had existed.
//
// So this card does two jobs:
//   1. THE DIAGNOSIS. A headcount with an empty register is a state the product
//      must name out loud, with the fix attached. It is the first thing rendered,
//      and it renders even when there is no import history to show — which is the
//      case for every school that uploaded before receipts existed.
//   2. THE RECEIPTS. Each intake, newest first: file name, when, how many it
//      counted, how many records it wrote, and the server's own note when it
//      wrote none.
//
// FERPA: filenames and counts. No student name appears here.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, FileSpreadsheet, Plug, Trash2, Upload } from 'lucide-react'
import { enrollmentApi, apiErrorMessage } from '../../lib/api.js'
import { moduleHue } from '../module/moduleAnatomy.js'

const ENROLL_HUE = moduleHue('enrollment')

function fmtDay(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function RosterSourceCard({
  schoolId,
  canEdit,
  headcount = null,
  rosterCount = null,
  onAddData,
  refreshToken = 0,
}) {
  const [imports, setImports] = useState(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(() => {
    if (!schoolId) return undefined
    let cancelled = false
    Promise.resolve().then(() => {
      if (cancelled) return
      enrollmentApi
        .listImports(schoolId)
        .then((res) => {
          if (!cancelled) setImports((res.data ?? res) ?? [])
        })
        .catch(() => {
          if (!cancelled) setImports([])
        })
    })
    return () => {
      cancelled = true
    }
  }, [schoolId])

  useEffect(() => load(), [load, refreshToken])

  const removeImport = async (id) => {
    setBusyId(id)
    setError('')
    try {
      await enrollmentApi.removeImport(schoolId, id)
      setImports((cur) => (cur ?? []).filter((i) => i.id !== id))
    } catch (e) {
      setError(apiErrorMessage(e, 'Could not remove that import record.'))
    } finally {
      setBusyId(null)
    }
  }

  // THE STATE THAT HAD NO WORDS: a counted headcount over an empty register.
  // Deliberately NOT gated on having import receipts — every school that uploaded
  // before this table existed has a headcount, no receipts, and needs this most.
  const countedButEmpty = (headcount ?? 0) > 0 && (rosterCount ?? 0) === 0

  if (!countedButEmpty && (imports == null || imports.length === 0)) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 240, damping: 24 }}
      className="card-soft p-5 sm:p-6"
    >
      {countedButEmpty ? (
        <div className="mb-4 flex flex-wrap items-start gap-3 rounded-xl border border-l-4 border-[#e8c96a] border-l-gold bg-[#fff8e6] px-4 py-3.5">
          <AlertTriangle size={17} className="mt-0.5 shrink-0 text-gold" />
          <div className="min-w-0 flex-1 basis-[18rem]">
            <p className="break-words text-[14px] font-semibold leading-snug text-[#7a5e00]">
              You have a headcount, but no student records.
            </p>
            <p className="mt-1 break-words text-[13.5px] leading-snug text-[#7a5e00]">
              {headcount.toLocaleString('en-US')} students were counted, and the register is
              empty — so Waitlist, Support flags and New this year have nothing to read. That
              happens when the file was counted before we started saving per-student rows, or when
              it carried totals only. Uploading the same file again builds the register.
            </p>
          </div>
          {canEdit && onAddData ? (
            <button
              type="button"
              onClick={onAddData}
              className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl bg-navy px-4 text-[12.5px] font-semibold uppercase tracking-[0.08em] text-white transition-opacity hover:opacity-90"
            >
              <Upload size={14} /> Upload it again
            </button>
          ) : null}
        </div>
      ) : null}

      {imports != null && imports.length > 0 ? (
        <>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="font-serif text-[17px] font-semibold text-navy">Where this came from</h3>
            <p className="text-[12.5px] text-muted">Most recent first</p>
          </div>
          <ul className="space-y-2">
            {imports.map((imp) => {
              const wrote = (imp.recordsCreated ?? 0) + (imp.recordsUpdated ?? 0)
              const when = fmtDay(imp.createdAt)
              return (
                <li
                  key={imp.id}
                  className="flex flex-wrap items-start gap-3 rounded-xl border border-rule/60 bg-white px-4 py-3"
                >
                  <span
                    className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-white"
                    style={{ backgroundColor: ENROLL_HUE }}
                    aria-hidden="true"
                  >
                    {imp.kind === 'sync' ? <Plug size={15} /> : <FileSpreadsheet size={15} />}
                  </span>
                  <div className="min-w-0 flex-1 basis-[16rem]">
                    <p className="break-words text-[14px] font-semibold leading-snug text-navy">
                      {imp.fileName ?? (imp.provider ? `Synced from ${imp.provider}` : 'Live sync')}
                    </p>
                    <p className="mt-0.5 break-words text-[12.5px] leading-snug text-muted">
                      {when ? `${when} · ` : ''}
                      {(imp.totalCounted ?? 0).toLocaleString('en-US')} counted
                      {' · '}
                      {wrote > 0
                        ? `${wrote.toLocaleString('en-US')} student record${wrote === 1 ? '' : 's'} written`
                        : 'no student records'}
                    </p>
                    {/* The server's own sentence. Never re-derived here — the old
                        panel guessed at this and pointed at unrelated notes. */}
                    {wrote === 0 && imp.recordsNote ? (
                      <p className="mt-1 break-words text-[12.5px] leading-snug text-[#7a5e00]">
                        {imp.recordsNote}
                      </p>
                    ) : null}
                    {(imp.warnings ?? []).map((w) => (
                      <p key={w} className="mt-1 break-words text-[12.5px] leading-snug text-muted">
                        {w}
                      </p>
                    ))}
                  </div>
                  {canEdit ? (
                    <button
                      type="button"
                      disabled={busyId === imp.id}
                      onClick={() => removeImport(imp.id)}
                      // Says what it removes. "Delete import" read as "delete the
                      // students" is how a school loses a roster by tidying a list.
                      title="Remove this record from the list. Your students are not deleted."
                      className="inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-lg border border-rule/70 px-2.5 text-[12px] font-semibold text-muted transition-colors hover:border-danger hover:text-danger disabled:opacity-40"
                    >
                      <Trash2 size={13} /> Remove entry
                    </button>
                  ) : null}
                </li>
              )
            })}
          </ul>
          <p className="mt-2.5 break-words text-[12px] leading-snug text-muted">
            Removing an entry clears it from this list only — it never deletes students. Students
            are edited and removed in <span className="font-semibold text-navy">Records</span>.
          </p>
        </>
      ) : null}

      {error ? (
        <p className="mt-3 break-words rounded-lg border border-danger/30 bg-danger/[0.06] px-3 py-2 text-[13px] text-danger">
          {error}
        </p>
      ) : null}
    </motion.div>
  )
}
