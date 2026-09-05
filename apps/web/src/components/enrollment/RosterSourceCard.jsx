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
//   2. THE RECEIPTS, GROUPED BY SCHOOL YEAR. The first cut printed one fat card
//      per receipt, newest first — which, for a school seeded with five years of
//      near-identical filenames, was a wall of duplicates with the years shuffled
//      together. Receipts now group under the school year each roster DESCRIBES
//      (the server-computed `schoolYear`, from the same Jul–Jun rule that filed
//      the snapshot), newest year first; within a year the LATEST import is the
//      row and earlier ones sit behind an "N earlier imports" toggle, dimmed as
//      superseded. Density of a table, not a stack of cards.
//
// THE ORIGINAL FILE: receipts now retain their CSV in the doc store, and rows
// that have one carry a "Download original" action (owner/accountant only — the
// FILE holds student names, so the action is gated to the same roles that can
// run an import; the server 403s a viewer regardless). Pre-retention receipts
// have no stored file and render with no download action — no fake links.
//
// FERPA: filenames, counts and years on this card. No student name appears here.
// ─────────────────────────────────────────────────────────────────────────────
import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  AlertTriangle,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Plug,
  Trash2,
  Upload,
} from 'lucide-react'
import { enrollmentApi, apiErrorMessage } from '../../lib/api.js'
import { moduleHue } from '../module/moduleAnatomy.js'
import { schoolYearLabel } from './enrollmentAnalyticsKit.jsx'

const ENROLL_HUE = moduleHue('enrollment')

function fmtDay(iso) {
  if (!iso) return null
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

/**
 * Fallback only — the server decorates every receipt with `schoolYear` through
 * the SAME fyEndForObservedOn that filed the snapshot. Re-stated here (Jul–Jun,
 * FY end year) purely so a stale cached response still groups instead of
 * crashing the panel.
 */
function fallbackSchoolYear(iso) {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.getUTCMonth() + 1 >= 7 ? d.getUTCFullYear() + 1 : d.getUTCFullYear()
}

/**
 * One receipt as a table-density row. `superseded` rows (earlier imports for the
 * same school year) render dimmed — the latest one above them is what the page
 * shows. The server-authored recordsNote / warnings still print in full: an
 * import that wrote nothing must say why even when it is not the latest.
 */
function ReceiptRow({ imp, superseded, canEdit, busyId, downloadId, onRemove, onDownload }) {
  const wrote = (imp.recordsCreated ?? 0) + (imp.recordsUpdated ?? 0)
  const when = fmtDay(imp.createdAt)
  return (
    <li
      className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 px-3 py-2 ${
        superseded ? 'opacity-70' : ''
      }`}
      title={
        superseded
          ? 'An earlier import for this school year — the latest one above is what the page shows.'
          : undefined
      }
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-white"
        style={{ backgroundColor: superseded ? '#9aa5b1' : ENROLL_HUE }}
        aria-hidden="true"
      >
        {imp.kind === 'sync' ? <Plug size={12} /> : <FileSpreadsheet size={12} />}
      </span>
      <div className="min-w-0 flex-1 basis-[14rem]">
        <p className="break-words text-[13px] font-semibold leading-snug text-navy">
          {imp.fileName ?? (imp.provider ? `Synced from ${imp.provider}` : 'Live sync')}
          {superseded ? (
            <span className="ml-2 align-middle text-[10px] font-bold uppercase tracking-[0.08em] text-muted">
              superseded
            </span>
          ) : null}
        </p>
        <p className="break-words text-[12px] leading-snug text-muted">
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
          <p className="mt-0.5 break-words text-[12px] leading-snug text-[#7a5e00]">
            {imp.recordsNote}
          </p>
        ) : null}
        {(imp.warnings ?? []).map((w) => (
          <p key={w} className="mt-0.5 break-words text-[12px] leading-snug text-muted">
            {w}
          </p>
        ))}
      </div>
      {/* Download original — ONLY when a file was retained for this receipt
          (pre-retention receipts have none; no fake links) and only for roles
          that can run imports. The file holds student names; a viewer's rows
          carry no download action and the server refuses them regardless. */}
      {canEdit && imp.originalDocumentId ? (
        <button
          type="button"
          disabled={downloadId === imp.id}
          onClick={() => onDownload(imp.id)}
          title="Download the original file exactly as it was imported."
          className="inline-flex min-h-[30px] shrink-0 items-center gap-1.5 rounded-lg border border-rule/70 px-2.5 text-[12px] font-semibold text-muted transition-colors hover:border-navy hover:text-navy disabled:opacity-40"
        >
          <Download size={13} /> Download original
        </button>
      ) : null}
      {canEdit ? (
        <button
          type="button"
          disabled={busyId === imp.id}
          onClick={() => onRemove(imp.id)}
          // Says what it removes. "Delete import" read as "delete the
          // students" is how a school loses a roster by tidying a list.
          title="Remove this record from the list. Your students are not deleted."
          className="inline-flex min-h-[30px] shrink-0 items-center gap-1.5 rounded-lg border border-rule/70 px-2.5 text-[12px] font-semibold text-muted transition-colors hover:border-danger hover:text-danger disabled:opacity-40"
        >
          <Trash2 size={13} /> Remove entry
        </button>
      ) : null}
    </li>
  )
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
  const [downloadId, setDownloadId] = useState(null)
  const [expandedYears, setExpandedYears] = useState(() => new Set())

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

  const downloadOriginal = async (id) => {
    setDownloadId(id)
    setError('')
    try {
      const res = await enrollmentApi.importOriginalUrl(schoolId, id)
      const url = (res.data ?? res)?.url
      if (url) window.open(url, '_blank', 'noopener,noreferrer')
    } catch (e) {
      setError(apiErrorMessage(e, 'Could not fetch the original file for that import.'))
    } finally {
      setDownloadId(null)
    }
  }

  // Receipts grouped by the SCHOOL YEAR the roster describes (server-computed;
  // Jul–Jun, FY end year), newest year first; newest import first within a year.
  // The latest import IS the year's row — the rest are history behind a toggle.
  const groups = useMemo(() => {
    const byYear = new Map()
    for (const imp of imports ?? []) {
      const year = imp.schoolYear ?? fallbackSchoolYear(imp.observedOn ?? imp.createdAt) ?? 0
      if (!byYear.has(year)) byYear.set(year, [])
      byYear.get(year).push(imp)
    }
    return [...byYear.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([year, list]) => {
        const sorted = [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        return { year, latest: sorted[0], earlier: sorted.slice(1) }
      })
  }, [imports])

  const toggleYear = (year) => {
    setExpandedYears((cur) => {
      const next = new Set(cur)
      if (next.has(year)) next.delete(year)
      else next.add(year)
      return next
    })
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
            <p className="text-[12.5px] text-muted">Newest school year first</p>
          </div>
          <div className="space-y-3.5">
            {groups.map(({ year, latest, earlier }) => {
              const expanded = expandedYears.has(year)
              return (
                <section key={year}>
                  <div className="mb-1.5 flex flex-wrap items-baseline gap-2">
                    <h4 className="text-[13px] font-bold tabular-nums text-navy">
                      {year ? schoolYearLabel(year) : 'Undated'}
                    </h4>
                    <span className="text-[11.5px] text-muted">
                      {earlier.length + 1} import{earlier.length === 0 ? '' : 's'}
                    </span>
                  </div>
                  <ul className="divide-y divide-rule/50 rounded-xl border border-rule/60 bg-white">
                    <ReceiptRow
                      imp={latest}
                      superseded={false}
                      canEdit={canEdit}
                      busyId={busyId}
                      downloadId={downloadId}
                      onRemove={removeImport}
                      onDownload={downloadOriginal}
                    />
                    {expanded
                      ? earlier.map((imp) => (
                          <ReceiptRow
                            key={imp.id}
                            imp={imp}
                            superseded
                            canEdit={canEdit}
                            busyId={busyId}
                            downloadId={downloadId}
                            onRemove={removeImport}
                            onDownload={downloadOriginal}
                          />
                        ))
                      : null}
                    {earlier.length > 0 ? (
                      <li>
                        <button
                          type="button"
                          onClick={() => toggleYear(year)}
                          aria-expanded={expanded}
                          className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-[12px] font-semibold text-muted transition-colors hover:text-navy"
                        >
                          <ChevronRight
                            size={13}
                            className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
                          />
                          {expanded
                            ? `Hide ${earlier.length} earlier import${earlier.length === 1 ? '' : 's'}`
                            : `· ${earlier.length} earlier import${earlier.length === 1 ? '' : 's'}`}
                        </button>
                      </li>
                    ) : null}
                  </ul>
                </section>
              )
            })}
          </div>
          <p className="mt-2.5 break-words text-[12px] leading-snug text-muted">
            Removing an entry clears it from this list and deletes its retained original file — it
            never deletes students. Students are edited and removed in{' '}
            <span className="font-semibold text-navy">Records</span>. Past files keep the names they
            were imported with, even after a student is later deleted from the register.
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
