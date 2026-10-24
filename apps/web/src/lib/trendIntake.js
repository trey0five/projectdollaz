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
import {
  ingest,
  listTrialBalanceSheets,
  listStatementSheets,
  isStatementPair,
  statementTypeFromFileName,
  inferPeriod,
  statementHalf,
  asStatementResult,
  mergeStatementResults,
  pairStatements,
  statementsTie,
  statementGap,
} from '@finrep/ingestion'
import { validateDataset } from '@finrep/engine'
import { failureFromError, failureText } from './ingestFailure.js'

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

/**
 * Build one candidate from parsed rows + metadata (+ optional workbook sheet).
 *
 * HALF A TRIAL BALANCE IS NEVER A YEAR (#41 S-D). A QuickBooks Profit and Loss
 * (or Balance Sheet) export on its own is `status:'partial'` — it never reaches
 * the annual bucket, so it can never be saved as a trend year. "Pair with…"
 * (pairChosen) merges a P&L half with its Balance Sheet into one `ready`
 * candidate — the person's choice, and only when they tie.
 */
export function toCandidate(sourceName, rows, metadata, sheet, warnings) {
  const inferred = inferPeriod(metadata)
  const periodEndDate = inferred.periodEndDate || null
  const year = periodEndDate
    ? Number(periodEndDate.slice(0, 4))
    : metadata?.fiscalYear ?? null
  const validation = validateDataset(rows)
  let partial = null
  try {
    partial = statementHalf(metadata) ?? null
  } catch {
    partial = null
  }
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
    partial,
    warnings: Array.isArray(warnings) ? warnings : [],
    status: partial ? 'partial' : 'ready',
  }
}

/** One error candidate (a file KYRO couldn't read), carrying what the picker needs. */
export function errorCandidate(fileName, err, bytes = null) {
  const failure = failureFromError(err)
  return {
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
    imbalance: 0,
    partial: null,
    warnings: [],
    status: 'error',
    failure,
    bytes: failure.canPick ? bytes : null,
    error: failureText(failure) || 'Could not read this file.',
  }
}

/**
 * Every importable sheet of a workbook, as {sheet, rows, metadata}. QuickBooks
 * STATEMENT exports (a workbook of monthly Statement-of-Activity tabs) are
 * consulted FIRST and win when present: the plain TB enumerator would read the
 * same tabs with natural-positive income as DEBITS. A Debit | Credit sheet is
 * never returned as a statement (hasDebitCreditHeader inside the adapter), and
 * a P&L + Balance Sheet PAIR yields [] so the single `ingest` path merges it
 * into ONE full trial balance instead of two half-candidates.
 */
export function workbookSheetCandidates(fileName, bytes, memory = null) {
  // A refused sheet (a "Budget Overview" tab) is reported by the adapter via
  // onWarning and never thrown from listStatementSheets; the try is belt and
  // braces so a sibling tab can never fail the TB sheets beside it.
  let statements = []
  try {
    statements = listStatementSheets(bytes, {
      typeHint: statementTypeFromFileName(fileName),
      knownSynthetic: memory?.synthetic,
    })
  } catch {
    statements = []
  }
  if (statements.length > 0) {
    if (isStatementPair(statements)) return []
    return statements.map((s) => ({
      sheet: s.metadata.sheet,
      rows: s.rows,
      metadata: s.metadata,
      warnings: s.warnings,
    }))
  }
  return listTrialBalanceSheets(bytes)
}

/**
 * Expand ONE dropped file into candidates. A multi-sheet .xlsx/.xls (2+ TB- or
 * statement-looking sheets) fans out to one candidate per sheet; otherwise a
 * single candidate via `ingest`. A parse failure yields ONE `error` candidate —
 * never aborts the batch.
 */
export async function expandFileToCandidates(fileName, bytes, memory = null) {
  try {
    if (/\.xlsx?$/i.test(fileName)) {
      const sheets = workbookSheetCandidates(fileName, bytes, memory)
      if (sheets.length > 1) {
        return sheets.map((s) => toCandidate(fileName, s.rows, s.metadata, s.sheet, s.warnings))
      }
    }
    const { rows, metadata, warnings } = ingest(fileName, bytes, { memory })
    return [toCandidate(fileName, rows, metadata, null, warnings)]
  } catch (e) {
    return [errorCandidate(fileName, e, bytes)]
  }
}

/**
 * Re-read an error candidate with the columns the person picked (#32). Throws
 * the parser's IngestError when the choice doesn't read — the picker only
 * enables "Use these columns" on a live success, so that's a guard, not a flow.
 */
export function candidateFromColumns(errorCand, bytes, choice, memory = null) {
  const { rows, metadata, warnings } = ingest(errorCand.sourceName, bytes, { columns: choice, memory })
  return { ...toCandidate(errorCand.sourceName, rows, metadata, null, warnings), key: errorCand.key }
}

/**
 * One `ready` candidate from a P&L half + a Balance Sheet half. The period end
 * is the Balance Sheet's "As of" date (mergeStatementResults), so a manual
 * "Pair with…" across dates files the year the balance sheet belongs to.
 */
export function mergeCandidates(pl, bs) {
  const a = asStatementResult(pl.rows, pl.metadata, pl.warnings)
  const b = asStatementResult(bs.rows, bs.metadata, bs.warnings)
  if (!a || !b) return null
  const merged = mergeStatementResults(a, b)
  const sourceName =
    pl.sourceName === bs.sourceName ? pl.sourceName : `${pl.sourceName} + ${bs.sourceName}`
  const sheet = [pl.sheet, bs.sheet].filter(Boolean).join(' + ') || null
  return {
    ...toCandidate(sourceName, merged.rows, merged.metadata, sheet, merged.warnings),
    merged: true,
    mergedFrom: [pl.key, bs.key],
  }
}

/**
 * Merge the P&L + Balance Sheet halves the person paired (`manual` =
 * [{plKey, bsKey}], "Pair with…") into one ready candidate, at the first half's
 * position — only when they tie (STATEMENT_TIE_TOLERANCE). Halves in SEPARATE
 * files are never merged on their own: they stay separate until the person
 * pairs them (customer upload 2026-10-24). Same-date sheets of ONE workbook
 * still merge (one export, like the single intake's parseStatementWorkbook) —
 * again only when they tie. Anything not partial is left as it is.
 */
export function pairCandidates(cands, manual = []) {
  const list = Array.isArray(cands) ? cands : []
  const partials = list.filter((c) => c.status === 'partial' && c.partial)
  if (partials.length < 2) return list
  const byKey = new Map(partials.map((c) => [c.key, c]))
  const used = new Set()
  const pairs = []
  for (const m of manual || []) {
    const a = byKey.get(m?.plKey)
    const b = byKey.get(m?.bsKey)
    if (!a || !b || a === b || used.has(a.key) || used.has(b.key) || a.partial === b.partial) continue
    const pl = a.partial === 'pl' ? a : b
    pairs.push({ pl, bs: pl === a ? b : a })
    used.add(a.key)
    used.add(b.key)
  }
  const rest = partials.filter((c) => !used.has(c.key))
  const byFile = new Map()
  for (const c of rest) byFile.set(c.sourceName, [...(byFile.get(c.sourceName) ?? []), c])
  for (const sheets of byFile.values()) pairs.push(...pairStatements(sheets, (c) => c.metadata).pairs)
  if (pairs.length === 0) return list

  const replace = new Map()
  for (const { pl, bs } of pairs) {
    const merged = mergeCandidates(pl, bs)
    if (!merged || !statementsTie(merged)) continue
    const first = list.indexOf(pl) <= list.indexOf(bs) ? pl : bs
    replace.set(first.key, merged)
    replace.set((first === pl ? bs : pl).key, null)
  }
  const out = []
  for (const c of list) {
    if (!replace.has(c.key)) {
      out.push(c)
      continue
    }
    const m = replace.get(c.key)
    if (m) out.push(m)
  }
  return out
}

/**
 * Partition candidates. ANNUAL is the only bucket that becomes saved periods
 * (savability is filtered by status/duplicate at the call site); it deliberately
 * INCLUDES in-flight/saved states so its chips persist through the save phase.
 *   • annual  = non-error, non-monthly, has a period-end
 *   • monthly = non-error, isMonthly — or a month's P&L tab (monthlyStatementKeys)
 *               (→ "belongs under Monthly numbers")
 *   • undated = non-error, non-monthly, no period-end (→ manual year picker)
 *   • partial = half a trial balance (P&L only / Balance Sheet only) — never saved
 *   • errors  = parse failures
 */
/**
 * The P&L halves that are MONTHS, not half a year (N4). A Statement-of-Activity
 * workbook with a tab per month reads as a stack of Profit and Loss halves, and
 * each said "Half a trial balance — add its Balance Sheet", which is the wrong
 * job: those belong under Monthly numbers. A P&L half is a month when
 *   • its own banner spans one month (statement.periodStart in the same month
 *     as its end), or
 *   • it has no start, and its file holds 2+ P&L halves for different month
 *     ends and no Balance Sheet (a set of monthly tabs).
 * A fiscal-year P&L ("July 2025 - June 2026") is never a month. → Set of keys.
 */
export function monthlyStatementKeys(cands) {
  const out = new Set()
  const list = (cands || []).filter((c) => c && c.status !== 'error')
  const byFile = new Map()
  for (const c of list) {
    if (!byFile.has(c.sourceName)) byFile.set(c.sourceName, [])
    byFile.get(c.sourceName).push(c)
  }
  for (const c of list) {
    if (c.partial !== 'pl' || !c.periodEndDate) continue
    const start = c.metadata?.statement?.periodStart
    const end = String(c.periodEndDate)
    if (start) {
      if (String(start).slice(0, 7) === end.slice(0, 7)) out.add(c.key)
      continue
    }
    const siblings = byFile.get(c.sourceName) || []
    const hasBs = siblings.some((o) => o.partial === 'bs')
    const plEnds = new Set(
      siblings.filter((o) => o.partial === 'pl' && o.periodEndDate).map((o) => String(o.periodEndDate).slice(0, 7)),
    )
    if (!hasBs && plEnds.size >= 2 && c.periodType !== 'fy') out.add(c.key)
  }
  return out
}

export function partitionCandidates(cands) {
  const annual = []
  const monthly = []
  const undated = []
  const partial = []
  const errors = []
  const months = monthlyStatementKeys(cands)
  for (const c of cands) {
    if (c.status === 'error') {
      errors.push(c)
      continue
    }
    // A month's Profit and Loss belongs under Monthly numbers, not "half a
    // trial balance" (it never becomes a year either way).
    if (months.has(c.key)) {
      monthly.push(c)
      continue
    }
    // Half a trial balance never becomes a year — checked before anything else
    // that could put it in `annual`.
    if (c.status === 'partial' || (c.partial && c.status === 'ready')) {
      partial.push(c)
      continue
    }
    if (c.isMonthly) {
      monthly.push(c)
      continue
    }
    if (c.periodEndDate) annual.push(c)
    else undated.push(c)
  }
  return { annual, monthly, undated, partial, errors }
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

/** "file — sheet" for a candidate. */
export const candidateName = (c) => `${c.sourceName}${c.sheet ? ` — ${c.sheet}` : ''}`

/** The candidates (re)paired and de-duplicated — the ONE way the list changes shape. */
export function settleCandidates(list) {
  return dedupeByYear(pairCandidates(list))
}

/**
 * "Pair with…": merge a P&L half and a Balance Sheet half the person chose
 * (any dates — the merged year is the Balance Sheet's). The merged candidate
 * takes the first half's place. Returns the list unchanged when they can't merge.
 */
export function pairChosen(list, aKey, bKey) {
  const a = list.find((c) => c.key === aKey)
  const b = list.find((c) => c.key === bKey)
  if (!a || !b || a.partial === b.partial || !a.partial || !b.partial) return list
  const pl = a.partial === 'pl' ? a : b
  const bs = pl === a ? b : a
  const merged = mergeCandidates(pl, bs)
  if (!merged) return list
  // Halves that don't tie are never combined (a balancing line would hide the
  // gap): both stay, each saying how far apart it is from the other.
  if (!statementsTie(merged)) {
    const gap = Math.abs(statementGap(merged))
    return list.map((c) =>
      c === pl || c === bs ? { ...c, noTie: { gap, partnerName: candidateName(c === pl ? bs : pl) } } : c,
    )
  }
  const out = []
  for (const c of list) {
    if (c.key === aKey) out.push(merged)
    else if (c.key !== bKey) out.push(c)
  }
  return dedupeByYear(out)
}
