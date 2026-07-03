// ─────────────────────────────────────────────────────────────────────────────
// trendIntake — pure helpers for the bulk "Add years" trial-balance uploader.
//
// Turns dropped files into per-YEAR candidates (one file, or one sheet of a
// multi-sheet workbook, per year), partitions them into annual/monthly/undated/
// error buckets, dedupes duplicate end-dates on the CLIENT (resolveForImport
// would silently collapse them server-side), and builds the fiscal-year timeline.
//
// Only ANNUAL (!isMonthly && a detected period-end) candidates ever become saved
// periods → annual trend points. Monthly workbooks route to the Monthly modal;
// undated files get a manual year picker (never guessed).
// ─────────────────────────────────────────────────────────────────────────────
import { ingest, listTrialBalanceSheets, inferPeriod } from '@finrep/ingestion'
import { validateDataset } from '@finrep/engine'

/** Read a File into an ArrayBuffer (shared with the single-intake path). */
export function readBytes(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read file.'))
    reader.onload = (e) => resolve(e.target.result)
    reader.readAsArrayBuffer(file)
  })
}

let seq = 0
const nextKey = () =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `c_${Date.now()}_${(seq += 1)}_${Math.random().toString(36).slice(2, 8)}`

/** Build one candidate from parsed rows + metadata (+ optional workbook sheet). */
export function toCandidate(sourceName, rows, metadata, sheet) {
  const inferred = inferPeriod(metadata)
  const periodEndDate = inferred.periodEndDate || null
  const year = periodEndDate
    ? Number(periodEndDate.slice(0, 4))
    : metadata?.fiscalYear ?? null
  const validation = validateDataset(rows)
  return {
    key: nextKey(),
    sourceName,
    sheet: sheet || null,
    rows,
    metadata: metadata || {},
    periodEndDate,
    periodType: inferred.periodType,
    year,
    isMonthly: !!metadata?.isMonthly,
    accountCount: rows.length,
    balanced: !!validation.balanced,
    imbalance: validation.difference,
    status: 'ready',
  }
}

/**
 * Expand ONE dropped file into candidates. A multi-sheet .xlsx/.xls (2+ TB-looking
 * sheets) fans out to one candidate per sheet; otherwise a single candidate via
 * `ingest`. A parse failure yields ONE `error` candidate — never aborts the batch.
 */
export async function expandFileToCandidates(fileName, bytes) {
  try {
    if (/\.xlsx?$/i.test(fileName)) {
      const sheets = listTrialBalanceSheets(bytes)
      if (sheets.length > 1) {
        return sheets.map((s) => toCandidate(fileName, s.rows, s.metadata, s.sheet))
      }
    }
    const { rows, metadata } = ingest(fileName, bytes)
    return [toCandidate(fileName, rows, metadata, null)]
  } catch (e) {
    return [
      {
        key: nextKey(),
        sourceName: fileName,
        sheet: null,
        rows: [],
        metadata: {},
        periodEndDate: null,
        periodType: 'fy',
        year: null,
        isMonthly: false,
        accountCount: 0,
        balanced: false,
        status: 'error',
        error: e?.message || 'Could not read this file.',
      },
    ]
  }
}

/**
 * Partition candidates. ANNUAL is the only bucket that becomes saved periods
 * (savability is filtered by status/duplicate at the call site); it deliberately
 * INCLUDES in-flight/saved states so its chips persist through the save phase.
 *   • annual  = non-error, non-monthly, has a period-end
 *   • monthly = non-error, isMonthly (→ "belongs under Monthly numbers")
 *   • undated = non-error, non-monthly, no period-end (→ manual year picker)
 *   • errors  = parse failures
 */
export function partitionCandidates(cands) {
  const annual = []
  const monthly = []
  const undated = []
  const errors = []
  for (const c of cands) {
    if (c.status === 'error') {
      errors.push(c)
      continue
    }
    if (c.isMonthly) {
      monthly.push(c)
      continue
    }
    if (c.periodEndDate) annual.push(c)
    else undated.push(c)
  }
  return { annual, monthly, undated, errors }
}

/**
 * Dedupe by period-end: when two READY annual candidates share a periodEndDate,
 * keep the one whose metadata.periodEndSource === 'explicit' (rank explicit >
 * fiscal-year-end) and mark the loser `duplicate:true` (cosmetic — resolveForImport
 * reuses by end-date anyway; we exclude losers from the save so nothing collapses).
 * Returns new candidate objects (stable keys) with the `duplicate` flag set.
 */
export function dedupeByYear(cands) {
  const rank = (x) => (x.metadata?.periodEndSource === 'explicit' ? 1 : 0)
  const winnerByDate = new Map()
  for (const c of cands) {
    if (c.status !== 'ready' || c.isMonthly || !c.periodEndDate) continue
    const prev = winnerByDate.get(c.periodEndDate)
    if (!prev || rank(c) > rank(prev)) winnerByDate.set(c.periodEndDate, c)
  }
  return cands.map((c) => {
    const eligible = c.status === 'ready' && !c.isMonthly && !!c.periodEndDate
    const duplicate = eligible ? winnerByDate.get(c.periodEndDate) !== c : false
    return c.duplicate === duplicate ? c : { ...c, duplicate }
  })
}

/**
 * Build the fiscal-year timeline for the annual set: fill min..max INCLUSIVE and
 * insert `{ year, gap:true }` for any missing year, so the axis reads as a
 * continuous run of years with visible gaps. Candidates carry a `candidate` field.
 */
export function buildTimeline(annual) {
  const withYear = annual.filter((c) => c.year != null)
  if (withYear.length === 0) return annual.map((c) => ({ year: c.year, candidate: c }))

  const years = withYear.map((c) => c.year)
  const min = Math.min(...years)
  const max = Math.max(...years)
  const byYear = new Map()
  for (const c of withYear) {
    if (!byYear.has(c.year)) byYear.set(c.year, [])
    byYear.get(c.year).push(c)
  }

  const out = []
  for (let y = min; y <= max; y += 1) {
    const cs = byYear.get(y)
    if (cs && cs.length) {
      for (const c of cs) out.push({ year: y, candidate: c })
    } else {
      out.push({ year: y, gap: true })
    }
  }
  // Any candidate without a detectable year (shouldn't happen for annual, but be
  // safe) tacks on at the end so it is never silently dropped.
  for (const c of annual) if (c.year == null) out.push({ year: null, candidate: c })
  return out
}
