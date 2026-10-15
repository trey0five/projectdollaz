// ─────────────────────────────────────────────────────────────────────────────
// reviewQueue — "which accounts still need a person?" in ONE place (A4).
//
// An account needs review when it carries a balance and the chart can't say
// what it is (findUnmapped). Two things make that answer honest:
//
//   • the SERVER knows picks this browser doesn't. GET /mapping returns no
//     entries, so a fresh page starts from the default chart and would re-flag
//     every account a school already sorted. The saved statement snapshot,
//     though, was built with the school's real mapping and lists exactly the
//     accounts IT couldn't place (payload.unmapped). An account of the saved
//     current-year file that the snapshot did NOT list is known on the server.
//   • the count is UNIQUE accounts: this year's and last year's files share
//     most of their accounts, and sorting one sorts both.
//
// Pure: the Finance band, the Add-data callout, the file card and the review
// panel all read their numbers from here, so they can never disagree.
// ─────────────────────────────────────────────────────────────────────────────
import { findUnmapped } from '@finrep/engine'

const key = (acct) => String(acct)

/**
 * Accounts the SERVER already places, by the saved snapshot: every account of
 * the persisted CURRENT-YEAR file of the snapshot's period that carries a
 * balance, minus the snapshot's own `unmapped` list. Empty when there is no
 * snapshot (nothing is assumed).
 *
 * The snapshot is built with the school's real mapping, and its `unmapped`
 * list is the one the server confirms is unplaced — but it is computed over
 * THIS YEAR's trial balance only. So only the current-year file's accounts are
 * vouched for. A saved last-year / audited file's OWN accounts (ones the
 * current year doesn't have) are not: the snapshot never looked at them, so
 * they are still asked about from the chart — otherwise an unplaced PY-only
 * account would read "sorted" everywhere while the last-year column silently
 * dropped it. An account that IS in this year's file is the server's in every
 * file (the set is keyed by account number). Unsaved files are untouched here.
 */
export function serverMappedAccts(snapshot, files) {
  const out = new Set()
  const payload = snapshot?.payload ?? snapshot ?? null
  const unmapped = payload?.unmapped
  if (!Array.isArray(unmapped)) return out
  const missing = new Set(unmapped.map((r) => key(r?.acct)))
  for (const f of files || []) {
    if (!f || f.status !== 'ready' || !f.persisted || f.fromHistory || f.role !== 'cy') continue
    for (const r of f.rows || []) {
      if (r && r.total !== 0 && !missing.has(key(r.acct))) out.add(key(r.acct))
    }
  }
  return out
}

/** One file's accounts that still need review (rows, findUnmapped order). */
export function reviewRowsOf(file, chart, serverMapped = null) {
  if (!file || file.status !== 'ready') return []
  const rows = findUnmapped(file.rows || [], chart)
  return serverMapped && serverMapped.size ? rows.filter((r) => !serverMapped.has(key(r.acct))) : rows
}

/**
 * Across the intake's files: { total (unique accounts), byId: {id: n},
 * firstId (the first file with something to review) }.
 */
export function reviewSummary(files, chart, serverMapped = null) {
  const seen = new Set()
  const byId = {}
  let firstId = null
  for (const f of files || []) {
    const rows = reviewRowsOf(f, chart, serverMapped)
    if (rows.length === 0) continue
    byId[f.id] = rows.length
    if (firstId == null) firstId = f.id
    for (const r of rows) seen.add(key(r.acct))
  }
  return { total: seen.size, byId, firstId }
}

/** How many accounts the saved statements could not place (null = unknown). */
export function snapshotReviewCount(snapshot) {
  const unmapped = (snapshot?.payload ?? snapshot)?.unmapped
  return Array.isArray(unmapped) ? unmapped.length : null
}

const plural = (n) => `${n} account${n === 1 ? '' : 's'}`

/** "12 accounts need a quick check" / "1 account needs a quick check". */
export function needsCheckPhrase(n) {
  return `${plural(n)} ${n === 1 ? 'needs' : 'need'} a quick check`
}

/** The Finance band's sentence when accounts await review. */
export function reviewVerdict(n, hasNumbers) {
  if (!n) return null
  return hasNumbers
    ? `${needsCheckPhrase(n)} before your numbers are complete.`
    : `${needsCheckPhrase(n)} before your numbers show.`
}

/** "Review 12 accounts" — the band's primary button. */
export function reviewButtonLabel(n) {
  return `Review ${plural(n)}`
}

/**
 * "3 of 12 have a category" — the review popup's progress line. Not "checked":
 * pre-filled suggestions count as answers, and the person may not have looked
 * at them yet, so the line says only what is true.
 */
export function reviewProgress(done, total) {
  const d = Math.max(0, Math.min(done, total))
  return `${d} of ${total} ${total === 1 ? 'has' : 'have'} a category`
}

/**
 * "5 to pick · 13 to confirm" — what the popup's N accounts actually ask for:
 * rows with no category need a pick; pre-filled suggestions only need a look.
 * All answered → "All 18 have a category".
 */
export function reviewSplit(missing, total) {
  const m = Math.max(0, Math.min(missing, total))
  const confirm = total - m
  if (m === 0) return `All ${total} ${total === 1 ? 'has' : 'have'} a category`
  return confirm > 0 ? `${m} to pick · ${confirm} to confirm` : `${m} to pick`
}

/**
 * The Finance band's deep link straight to the OPEN review panel on the
 * Add-data trial-balance step (ui.v2). `review=1` asks the intake to open it.
 */
export const REVIEW_HREF = '/finance?tab=add&add=tb&review=1'
