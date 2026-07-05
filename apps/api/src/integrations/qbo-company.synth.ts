// Diocesan QuickBooks (Topology B) — PURE report-synthesis module. No I/O, no
// Nest, no Prisma: everything here is a deterministic transform from QBO's
// summarized ProfitAndLoss / BalanceSheet JSON (one Money column per
// Department/Class value) to engine trial-balance rows for ONE school.
//
// Why synthesis at all: QBO's TrialBalance report IGNORES summarize_column_by
// and department filters (verified against the live sandbox), so a per-location
// TB does not exist as a report. Instead we pull P&L + BS split by dimension,
// pick the school's column(s), and rebuild {acct, desc, total} rows with the
// TB sign convention (total = debit − credit):
//   P&L Revenue → −v · P&L Expense → +v · BS Asset → +v · BS Liability/Equity → −v
// (report values are natural-positive). A per-location P&L+BS is NOT guaranteed
// to balance (interlocation due-to/due-from entries often aren't tagged), so a
// small acct-399 plug row absorbs the residual — see applyBalancePlug.
import { deriveAcct, type QboAccountMeta, type QboTrialBalanceRow } from './qbo.client.js'

// ── Raw report JSON shapes (loose — QBO omits almost everything sometimes) ────

export interface QboReportCell {
  value?: string
  /** QBO entity id — on ColData[0] it's the ACCOUNT id (the stable row key). */
  id?: string
}

export interface QboReportColumn {
  ColTitle?: string
  ColType?: string
  /** Column identity metadata; some tenants emit the dimension id here. */
  MetaData?: Array<{ Name?: string; Value?: string }>
}

export interface QboReportRow {
  type?: string
  /** Section tag, e.g. 'Income', 'Expenses' — or a COMPUTED group like 'NetIncome'. */
  group?: string
  ColData?: QboReportCell[]
  Header?: { ColData?: QboReportCell[] }
  Summary?: { ColData?: QboReportCell[] }
  Rows?: { Row?: QboReportRow[] }
}

export interface QboSummarizedReport {
  Header?: Record<string, unknown>
  Columns?: { Column?: QboReportColumn[] }
  Rows?: { Row?: QboReportRow[] }
}

// ── Column matching ───────────────────────────────────────────────────────────

/** The pseudo qboId a stored mapping row uses for the "Not Specified" column. */
export const NOT_SPECIFIED_ID = '__unspecified__'

export interface MatchedColumns {
  /** dimension qboId → report column index (the ColData offset for that value). */
  valueByQboId: Map<string, number>
  /** Column index of the "Not Specified" (no-dimension-tagged) column, if present. */
  notSpecified: number | null
  /** Column index of the report's "Total" column (always dropped from math). */
  total: number | null
}

/**
 * Map report Money columns onto dimension values. QBO id first (any Column
 * MetaData value — tenants that emit ColKey ids stay stable across renames),
 * title second (the common case: ColTitle is the dimension's display name).
 * Column 0 is the account-name column; the trailing "Not Specified" and
 * "Total" columns are identified by title. A dimension value with no activity
 * in the window simply has no column — callers treat a missing index as zero.
 */
export function matchColumns(
  columns: QboReportColumn[],
  dimensionList: Array<{ id: string; name: string }>,
): MatchedColumns {
  const byId = new Map(dimensionList.map((d) => [d.id, d]))
  const byName = new Map(dimensionList.map((d) => [d.name.toLowerCase(), d]))
  const result: MatchedColumns = { valueByQboId: new Map(), notSpecified: null, total: null }

  for (let i = 1; i < columns.length; i++) {
    const col = columns[i]
    const title = (col.ColTitle ?? '').trim()
    const lower = title.toLowerCase()
    if (lower === 'total') {
      result.total = i
      continue
    }
    if (lower === 'not specified') {
      result.notSpecified = i
      continue
    }
    // Id match beats title match — but ONLY for id-ish MetaData entries
    // ('id' / 'ColKey'). Dimension ids are small integers ("1", "2"), so
    // checking EVERY MetaData value against the id set could bind an unrelated
    // entry (currency code, format key) to the wrong column.
    const idHit = (col.MetaData ?? [])
      .filter((m) => /^(id|colkey)$/i.test((m.Name ?? '').trim()))
      .map((m) => (m.Value ?? '').trim())
      .find((v) => v !== '' && byId.has(v))
    const dim = idHit != null ? byId.get(idHit) : byName.get(lower)
    if (dim && !result.valueByQboId.has(dim.id)) result.valueByQboId.set(dim.id, i)
  }
  return result
}

// ── Row flattening ────────────────────────────────────────────────────────────

/** One real account row pulled out of the nested report. */
export interface FlatRow {
  name: string
  /** QBO account id from ColData[0].id (null when the report omits it). */
  accountId: string | null
  /** Numeric cell per report COLUMN INDEX (index 0 = the account column, always 0). */
  values: number[]
  /** Enclosing section groups, outermost→innermost — the sign fallback when
   *  the account has no metadata (e.g. 'Income' ⇒ revenue on a P&L). */
  groups: string[]
}

/** COMPUTED section groups — derived subtotals, never real accounts. Skipped
 *  whole (their children are other sections, not accounts). */
const COMPUTED_GROUPS = new Set(['NetIncome', 'GrossProfit', 'NetOperatingIncome', 'NetOtherIncome'])

function parseCells(cols: QboReportCell[]): number[] {
  // Aligned to column indices; index 0 (the name cell) parses to 0 harmlessly.
  return cols.map((c) => Number(c.value ?? 0) || 0)
}

/**
 * Recurse Rows.Row and emit every REAL account row exactly once:
 *  - Data rows with a name (skipping the computed id-less 'Net Income' row and
 *    any id-less row named 'Total …' — textual subtotals some layouts emit).
 *  - A Section's Header ONLY when it carries an account id AND at least one
 *    numeric cell: that's a parent account with its OWN balance (its children
 *    are separate rows). A purely structural header ('Income') has no id.
 *  - NEVER Summary rows ('Total Income' …) — they'd double-count the section.
 *  - COMPUTED sections (NetIncome/GrossProfit/…) are skipped entirely.
 */
export function flattenRows(report: QboSummarizedReport): FlatRow[] {
  const out: FlatRow[] = []

  const walk = (rows: QboReportRow[] | undefined, groups: string[]): void => {
    for (const row of rows ?? []) {
      const group = (row.group ?? '').trim()
      if (COMPUTED_GROUPS.has(group)) continue

      if (row.Rows?.Row) {
        // Section. Emit the Header as a row only for a parent ACCOUNT with its
        // own balance; then recurse. Summary is never emitted.
        const header = row.Header?.ColData ?? []
        const headerId = (header[0]?.id ?? '').trim()
        const headerName = (header[0]?.value ?? '').trim()
        const headerHasValues = header.slice(1).some((c) => (c.value ?? '').trim() !== '')
        if (headerId !== '' && headerName !== '' && headerHasValues) {
          out.push({
            name: headerName,
            accountId: headerId,
            values: parseCells(header),
            groups,
          })
        }
        walk(row.Rows.Row, group !== '' ? [...groups, group] : groups)
        continue
      }

      const cols = row.ColData ?? []
      const name = (cols[0]?.value ?? '').trim()
      if (name === '') continue
      const accountId = (cols[0]?.id ?? '').trim() || null
      // Computed rows sneak in as id-less Data rows in some layouts.
      if (accountId == null && (name === 'Net Income' || name.startsWith('Total '))) continue
      out.push({ name, accountId, values: parseCells(cols), groups })
    }
  }

  walk(report.Rows?.Row, [])
  return out
}

// ── Per-school row synthesis ──────────────────────────────────────────────────

export interface SchoolColumnIdxs {
  /** The school's column indices in the P&L report (many-to-one: columns sum). */
  pnl: number[]
  /** …and in the BS report (matched independently — indices can differ). */
  bs: number[]
}

export interface AccountMetaMaps {
  byId: Map<number, QboAccountMeta>
  byName: Map<string, QboAccountMeta>
}

export interface SchoolRowsBuild {
  rows: QboTrialBalanceRow[]
  /** acct → SCoA category for type-derived P&L accounts (merge into the school mapping). */
  plEntries: Record<string, string>
}

/** Round to cents — report cells are 2dp; float summing must not leak dust. */
function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Section-group fallbacks when an account has no metadata row. */
const PNL_REVENUE_GROUPS = new Set(['income', 'otherincome'])
const PNL_EXPENSE_GROUPS = new Set(['expenses', 'otherexpenses', 'cogs'])

function resolveMeta(row: FlatRow, meta: AccountMetaMaps): QboAccountMeta | undefined {
  if (row.accountId != null) {
    const m = meta.byId.get(Number(row.accountId))
    if (m) return m
  }
  return meta.byName.get(row.name.toLowerCase())
}

/**
 * Sign multiplier turning a natural-positive report value into a TB total
 * (debit − credit). Meta Classification decides first (authoritative — a
 * contra row keeps its own sign); the report/section origin is the fallback
 * for accounts the metadata query missed.
 */
function signFor(report: 'pnl' | 'bs', meta: QboAccountMeta | undefined, groups: string[]): 1 | -1 {
  const c = meta?.classification ?? ''
  if (c === 'Revenue') return -1
  if (c === 'Expense') return 1
  if (c === 'Asset') return 1
  if (c === 'Liability' || c === 'Equity') return -1

  // Innermost group wins (an 'Equity' subsection inside 'TotalLiabilitiesAndEquity').
  const lower = groups.map((g) => g.toLowerCase()).reverse()
  if (report === 'pnl') {
    for (const g of lower) {
      if (PNL_REVENUE_GROUPS.has(g)) return -1
      if (PNL_EXPENSE_GROUPS.has(g)) return 1
    }
    return 1 // unknown P&L section — treat as expense (natural-positive debit)
  }
  for (const g of lower) {
    if (g.includes('equity') || g.includes('liabilit')) return -1
    if (g.includes('asset')) return 1
  }
  return 1
}

/**
 * Build ONE school's engine trial-balance rows out of the two flattened reports:
 * sum the school's columns per row (many-to-one mapping), drop zero rows, sign
 * per the TB convention, and number accounts exactly like getTrialBalance —
 * real AcctNum first, type-derived block number (collecting plEntries) second,
 * synthetic 90000+ for accounts with no metadata at all. Rows sharing an acct
 * are NOT merged (the engine sums them, same as the TB path).
 */
export function buildSchoolRows(
  pnlFlat: FlatRow[],
  bsFlat: FlatRow[],
  cols: SchoolColumnIdxs,
  meta: AccountMetaMaps,
): SchoolRowsBuild {
  const rows: QboTrialBalanceRow[] = []
  const plEntries: Record<string, string> = {}
  let synthetic = 90000

  const emit = (report: 'pnl' | 'bs', flat: FlatRow[], idxs: number[]): void => {
    for (const row of flat) {
      const v = round2(idxs.reduce((sum, i) => sum + (row.values[i] ?? 0), 0))
      if (v === 0) continue // zero cells carry no information — drop
      const m = resolveMeta(row, meta)
      let acct: number
      if (m?.acctNum != null) {
        acct = m.acctNum
      } else if (m) {
        const derived = deriveAcct(m)
        acct = derived.acct >= 0 ? derived.acct : synthetic++
        if (derived.category && derived.acct >= 0) plEntries[String(acct)] = derived.category
      } else {
        acct = synthetic++
      }
      rows.push({ acct, desc: row.name, total: round2(signFor(report, m, row.groups) * v) })
    }
  }

  emit('pnl', pnlFlat, cols.pnl)
  emit('bs', bsFlat, cols.bs)
  return { rows, plEntries }
}

// ── The acct-399 balancing plug ───────────────────────────────────────────────

export const PLUG_ACCT = 399
export const PLUG_DESC = 'Interlocation balance (organization QuickBooks)'

export interface PlugResult {
  rows: QboTrialBalanceRow[]
  /** The plug row's total when one was appended (−imbalance), else null. */
  balancePlug: number | null
  /** Σ of the pre-plug totals — how far off balance this location's books were. */
  imbalance: number
}

/**
 * A single location's P&L+BS rarely balances on its own (untagged interlocation
 * due-to/due-from entries). Absorb the residual into one explicit acct-399 row
 * so the engine's SFP ties — visible and labeled, never silently spread. Within
 * a cent (|Σ| ≤ 0.01) the rows pass through untouched.
 */
export function applyBalancePlug(rows: QboTrialBalanceRow[]): PlugResult {
  const diff = round2(rows.reduce((sum, r) => sum + r.total, 0))
  if (Math.abs(diff) <= 0.01) return { rows, balancePlug: null, imbalance: diff }
  const plug = round2(-diff)
  return {
    rows: [...rows, { acct: PLUG_ACCT, desc: PLUG_DESC, total: plug }],
    balancePlug: plug,
    imbalance: diff,
  }
}

// ── Small column helpers for the service ─────────────────────────────────────

/** Σ of one report column over the flattened rows (gross activity for a P&L —
 *  revenue and expense cells are both natural-positive, so they ADD). */
export function sumColumn(flat: FlatRow[], colIdx: number): number {
  return round2(flat.reduce((sum, r) => sum + (r.values[colIdx] ?? 0), 0))
}

/**
 * The CY P&L totals still sitting in "Not Specified" (untagged transactions) —
 * surfaced after an import so unallocated money is never silently dropped.
 * Sections resolve exactly like buildSchoolRows (meta first, groups fallback).
 */
export function notSpecifiedTotals(
  pnlFlat: FlatRow[],
  colIdx: number | null,
  meta: AccountMetaMaps,
): { revenue: number; expense: number } {
  if (colIdx == null) return { revenue: 0, expense: 0 }
  let revenue = 0
  let expense = 0
  for (const row of pnlFlat) {
    const v = row.values[colIdx] ?? 0
    if (v === 0) continue
    if (signFor('pnl', resolveMeta(row, meta), row.groups) === -1) revenue += v
    else expense += v
  }
  return { revenue: round2(revenue), expense: round2(expense) }
}
