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
import { ChevronRight, Download, FileSpreadsheet, FileStack, Plug, Trash2, Upload, Users } from 'lucide-react'
import { enrollmentApi, apiErrorMessage } from '../../lib/api.js'
import { Button, Pill } from '../ui/surface/index.js'
import { AuroraSection, AuroraTile, AuroraTileGrid, AuroraLightButton } from '../ui/aurora/index.js'
import { schoolYearLabel } from './enrollmentAnalyticsKit.jsx'

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
      className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 border-b border-hair py-2 ${
        superseded ? 'opacity-70' : ''
      }`}
      title={
        superseded
          ? 'An earlier import for this school year — the latest one above is what the page shows.'
          : undefined
      }
    >
      <span className="shrink-0 text-ink2" aria-hidden="true">
        {imp.kind === 'sync' ? <Plug size={13} /> : <FileSpreadsheet size={13} />}
      </span>
      <div className="min-w-0 flex-1 basis-[14rem]">
        <p className="break-words text-small font-semibold leading-snug text-ink">
          {imp.fileName ?? (imp.provider ? `Synced from ${imp.provider}` : 'Live sync')}
          {superseded ? <Pill className="ml-2 align-middle">superseded</Pill> : null}
        </p>
        <p className="break-words text-[12px] leading-snug text-ink2">
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
          <p className="mt-0.5 flex items-start gap-1.5 break-words text-[12px] leading-snug text-ink2">
            <span className="mark tone-watch mt-[3px]" aria-hidden="true" />
            {imp.recordsNote}
          </p>
        ) : null}
        {(imp.warnings ?? []).map((w) => (
          <p key={w} className="mt-0.5 break-words text-[12px] leading-snug text-ink2">
            {w}
          </p>
        ))}
      </div>
      {/* Download original — ONLY when a file was retained for this receipt
          (pre-retention receipts have none; no fake links) and only for roles
          that can run imports. The file holds student names; a viewer's rows
          carry no download action and the server refuses them regardless. */}
      {canEdit && imp.originalDocumentId ? (
        <Button
          variant="quiet"
          size="sm"
          disabled={downloadId === imp.id}
          onClick={() => onDownload(imp.id)}
          title="Download the original file exactly as it was imported."
          icon={<Download size={13} />}
          className="dt-actions shrink-0"
        >
          Download original
        </Button>
      ) : null}
      {canEdit ? (
        <Button
          variant="quiet"
          size="sm"
          disabled={busyId === imp.id}
          onClick={() => onRemove(imp.id)}
          // Says what it removes. "Delete import" read as "delete the
          // students" is how a school loses a roster by tidying a list.
          title="Remove this record from the list. Your students are not deleted."
          icon={<Trash2 size={13} />}
          className="dt-actions shrink-0"
        >
          Remove entry
        </Button>
      ) : null}
    </li>
  )
}

/**
 * THE DIAGNOSIS, as one tile: a counted headcount over an empty register. The
 * page drops it into its "Needs a look" section; the default card below still
 * renders it on its own when the page does not (diagnosis defaults on).
 */
export function RosterDiagnosisTile({ headcount, canEdit, onAddData }) {
  return (
    <AuroraTile
      icon={Users}
      tone="watch"
      title="You have a headcount, but no student records."
      desc={`${headcount.toLocaleString('en-US')} students were counted, but the list is empty. Upload the same file again to build it.`}
      tip={`${headcount.toLocaleString('en-US')} students were counted and the register is empty — so Waitlist, Support flags and New this year have nothing to read. That happens when the file was counted before we started saving per-student rows, or when it carried totals only. Uploading the same file again builds the register.`}
      foot={
        canEdit && onAddData ? (
          <AuroraLightButton size="sm" hue="#b45309" onClick={onAddData} icon={<Upload size={14} aria-hidden="true" />}>
            Upload it again
          </AuroraLightButton>
        ) : null
      }
    />
  )
}

export default function RosterSourceCard({
  schoolId,
  canEdit,
  headcount = null,
  rosterCount = null,
  onAddData,
  refreshToken = 0,
  diagnosis = true,
}) {
  const [imports, setImports] = useState(null)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [downloadId, setDownloadId] = useState(null)
  const [expandedYears, setExpandedYears] = useState(() => new Set())
  const [historyOpen, setHistoryOpen] = useState(false)

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
    >
      {countedButEmpty && diagnosis ? (
        <AuroraTileGrid cols={2} className="mt-6">
          <RosterDiagnosisTile headcount={headcount} canEdit={canEdit} onAddData={onAddData} />
        </AuroraTileGrid>
      ) : null}

      {imports != null && imports.length > 0 ? (
        /* Collapsed by default: provenance is metadata, not a primary surface.
           One summary line; the grouped history renders only on request. */
        <AuroraSection
          icon={FileStack}
          title="Where the numbers came from"
          subtitle="Every file and sync, by school year"
          aside={
            <AuroraLightButton
              variant="ghost"
              size="sm"
              onClick={() => setHistoryOpen((v) => !v)}
              aria-expanded={historyOpen}
              icon={<ChevronRight size={14} className={`transition-transform ${historyOpen ? 'rotate-90' : ''}`} aria-hidden="true" />}
            >
              {historyOpen ? 'Hide history' : 'View history'}
            </AuroraLightButton>
          }
        >
          <p className="text-small text-ink2">
            {imports.length} import{imports.length === 1 ? '' : 's'} across {groups.length} school
            year{groups.length === 1 ? '' : 's'}
          </p>
          {historyOpen ? (
          <div className="au-card au-card-flat mt-3 space-y-4">
            {groups.map(({ year, latest, earlier }) => {
              const expanded = expandedYears.has(year)
              return (
                <section key={year}>
                  <div className="mb-1 flex flex-wrap items-baseline gap-2 border-b border-hair pb-1">
                    <h4 className="text-micro font-semibold uppercase tabular-nums text-ink2">
                      {year ? schoolYearLabel(year) : 'Undated'}
                    </h4>
                    <span className="text-[11px] text-ink2">
                      {earlier.length + 1} import{earlier.length === 0 ? '' : 's'}
                    </span>
                  </div>
                  <ul>
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
                          className="flex w-full items-center gap-1.5 py-2 text-left text-[12px] font-semibold text-ink2 transition-colors hover:text-ink"
                        >
                          <ChevronRight
                            size={13}
                            className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
                            aria-hidden="true"
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
          ) : null}
          {historyOpen ? (
          <p className="mt-2 text-[12px] leading-snug text-ink2">
            Removing an entry clears it from this list and deletes its retained original file — it
            never deletes students. Students are edited and removed in{' '}
            <span className="font-semibold text-ink">Records</span>. Past files keep the names they
            were imported with, even after a student is later deleted from the register.
          </p>
          ) : null}
        </AuroraSection>
      ) : null}

      {error ? <p className="mt-3 break-words text-small text-risk">{error}</p> : null}
    </motion.div>
  )
}
