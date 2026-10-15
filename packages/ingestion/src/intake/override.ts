// ─────────────────────────────────────────────────────────────
// Reading a file with the columns a PERSON picked (#32).
//
// The picker supplies columns, never a verdict on what the file is: whether
// the grid is walked as a QuickBooks statement is still decided by the
// existing evidence (banner, file name, section rows), and a Debit | Credit
// grid — or a person choosing Debit + Credit columns — is ALWAYS a trial
// balance. Picked budget / variance / prior-year columns are refused, an
// "account numbers" column that holds amounts is refused (columnHoldsAmounts),
// a column of zeros is refused, and text in an amount cell skips the row (it
// is never read as 0).
// ─────────────────────────────────────────────────────────────
import type { ColumnChoice, IngestionResult, IntakeMemory, NormalizedRow, SavedLayout } from '../types.js'
import {
  ACTUAL_HEADER,
  hasDebitCreditHeader,
  isBudgetReport,
  hasKnownSectionRow,
  isStatementExport,
  parseMoney,
  parseStatementGridDetailed,
  StatementExportError,
  stackedHeaderAt,
  statementTypeFromFileName,
  statementTypeOfGrid,
  type RawGrid,
} from '../statements/statementAdapter.js'
import { ACCT_MAX, isPlausibleAcct } from '../adapters/excelAdapter.js'
import { extractSheetMetadata } from '../metadata.js'
import { IngestError, type IngestErrorCode } from './errors.js'
import { columnLetter, explainFailure, findDebitCreditPair, layoutSignature, readGrid, type ColumnRole, type FailureVariant } from './preview.js'

/** A header that names budget, variance, percentage or prior-year figures — never actual balances. */
export const BUDGETISH = /budget|variance|%|percent|\bprior\b|last\s*year|\bpy\b/i

/**
 * A header that names a MONEY column — actuals, budget, totals, balances,
 * variance, a percentage, debits / credits, or a period label ("Jun 2026",
 * "Jul - Jun 26") — never the account numbers.
 */
export const MONEY_HEADER =
  /\b(actuals?|budget(ed)?|totals?|amounts?|balances?|variance|debits?|credits?|ytd)\b|over\s*budget|%|percent|year\s+to\s+date|^net$/i
const MONTH = '(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|june?|july?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)\\.?'
/** A header that IS a period label: "June", "Jun 2026", "Jul - Jun 26", "Q4 2026". */
const PERIOD_HEADER = new RegExp(`^(${MONTH}(\\s*[-–]\\s*${MONTH})?\\s*,?\\s*'?(\\d{2}|\\d{4})?|q[1-4]\\s*'?\\d{2,4})$`, 'i')
/** A header that names the ACCOUNT column: its values are trusted as account numbers (fund / department repeats, 1010.10 sub-accounts). */
const ACCOUNT_HEADER = /\b(acct|accounts?|gl|number|no\.?|code|id)\b|#/i
/** A whole cell that is a bare column label, as QuickBooks stacks one on the row above ("Actual", "Budget", "Acct"). */
const MONEY_LABEL =
  /^(actuals?|budget(ed)?|totals?|amounts?|balances?|variance|over\s*budget|%\s*of\s*budget|debits?|credits?|ytd|net)$/i
const ACCOUNT_LABEL = /^(acct|account|gl|number|no\.?|#|account\s*(#|no\.?|number))$/i

/** Body rows judged when deciding whether a column holds amounts. */
const ACCT_SCAN_ROWS = 500

const nonEmptyCells = (r: unknown[] | undefined): number => (r ?? []).filter((c) => cellText(c) !== '').length

/**
 * The header text of a would-be account column. The header row's own cell —
 * unless that row is a banner (its ONLY text: "Trial Balance"). Blank: the
 * nearest of the two rows above, but only a bare column LABEL stacked there
 * (QuickBooks prints `_ | Actual | Budget` over the names row) — never banner
 * text like "Trial Balance" or "As of June 30, 2026".
 */
function acctHeaderText(grid: RawGrid, headerRow: number, col: number): string {
  if (headerRow < 0 || col < 0) return ''
  const own = grid[headerRow]
  const t0 = cellText(own?.[col])
  if (t0 !== '') return nonEmptyCells(own) > 1 ? t0 : ''
  for (let up = 1; up <= 2; up++) {
    const r = headerRow - up >= 0 ? grid[headerRow - up] : undefined
    const t = r ? cellText(r[col]) : ''
    if (t === '') continue
    return MONEY_LABEL.test(t) || ACCOUNT_LABEL.test(t) || PERIOD_HEADER.test(t) ? t : ''
  }
  return ''
}

const NUMERIC_TEXT = /^[-–(]?\s*\$?\s*[\d,]*\d(\.\d+)?\s*\)?$/

/**
 * SINGLE SOURCE OF TRUTH (preview flag + picker refusal): does column `col`
 * hold AMOUNTS rather than account numbers?
 *  • Its header names money (Actual / Budget / Total / Amount / Balance /
 *    over Budget / % / a month) → yes.
 *  • Its header names an account (Acct / Account / GL / Number / No. / Code /
 *    ID / #) → no: the values are trusted, as before — multi-fund and
 *    department-split charts repeat a number, sub-accounts print 1010.10.
 *  • Otherwise (no / other header), by its numbers: any number over ACCT_MAX
 *    (2,100,000 is a salary line, not an account), or decimals / negatives on
 *    at least two rows and a fifth of them (one footer date-time cell or a
 *    0000 suspense row is just a skipped row, never a refused column).
 * Text cells ("4000-10", "Total") and zeros are not judged; repeats are allowed
 * (1000 Cash … 1000 Total Cash; one account in several funds).
 */
export function columnHoldsAmounts(grid: RawGrid, headerRow: number, col: number): boolean {
  return acctColumnVerdict(grid, headerRow, col) === 'amounts'
}

/**
 * columnHoldsAmounts with one more answer: 'header-row' when the only
 * evidence is money words in a header row that is not column names at all (a
 * banner such as `Trial Balance | | | As of June 30, 2026` picked as the
 * header, over a column of plausible account numbers) — the row is wrong,
 * not the column.
 */
export function acctColumnVerdict(grid: RawGrid, headerRow: number, col: number): 'ok' | 'amounts' | 'header-row' {
  if (!grid || col < 0) return 'ok'
  const h = acctHeaderText(grid, headerRow, col)
  const values = valueVerdict(grid, headerRow, col)
  if (h && (MONEY_HEADER.test(h) || BUDGETISH.test(h) || PERIOD_HEADER.test(h))) {
    // Column names label most of the columns below them; a banner labels at
    // most half (`Trial Balance | | | As of June 30, 2026` over Acct | Desc | Dr | Cr).
    const row = grid[headerRow]
    const sparse = nonEmptyCells(row) * 2 <= populatedColumns(grid, headerRow + 1)
    return values === 'accounts' && sparse && cellText(row?.[col]) !== '' ? 'header-row' : 'amounts'
  }
  if (h && ACCOUNT_HEADER.test(h)) return 'ok'
  return values === 'amounts' ? 'amounts' : 'ok'
}

/** Columns holding any text in the 50 rows from `start`. */
function populatedColumns(grid: RawGrid, start: number): number {
  const cols = new Set<number>()
  for (let i = Math.max(0, start); i < Math.min(grid.length, start + 50); i++) {
    ;(grid[i] ?? []).forEach((c, j) => {
      if (cellText(c) !== '') cols.add(j)
    })
  }
  return cols.size
}

/** By the numbers alone: 'amounts', 'accounts' (≥ 1 plausible number, nothing odd) or 'none'. */
function valueVerdict(grid: RawGrid, headerRow: number, col: number): 'amounts' | 'accounts' | 'none' {
  const start = Math.max(0, headerRow + 1)
  const end = Math.min(grid.length, start + ACCT_SCAN_ROWS)
  let numbers = 0
  let odd = 0
  for (let i = start; i < end; i++) {
    const v = grid[i]?.[col]
    const t = cellText(v)
    if (t === '') continue
    if (typeof v !== 'number' && !NUMERIC_TEXT.test(t)) continue
    const n = typeof v === 'number' ? v : parseMoney(t)
    if (n === null || n === 0) continue
    numbers++
    if (Math.abs(n) > ACCT_MAX) return 'amounts'
    if (!isPlausibleAcct(n)) odd++
  }
  if (odd >= 2 && odd >= numbers * 0.2) return 'amounts'
  return numbers > odd ? 'accounts' : 'none'
}

/**
 * columnHoldsAmounts for every column of a file's sheet at a given header row
 * — the picker re-asks when the person moves the header row. [] when the file
 * cannot be read as a grid.
 */
export function columnsHoldingAmounts(
  fileName: string,
  bytes: ArrayBuffer,
  opts: { sheet?: string | null; headerRow: number },
): boolean[] {
  let grid: RawGrid
  try {
    grid = readGrid(fileName, bytes, opts.sheet ?? null).grid
  } catch {
    return []
  }
  return Array.from({ length: widthOf(grid) }, (_, c) => columnHoldsAmounts(grid, opts.headerRow, c))
}

/**
 * Single source of truth (preview + override) for "will this grid be walked
 * as a QuickBooks statement?": never for a Debit | Credit grid; otherwise the
 * statement structure, a banner / sheet-name title, the file name, or a known
 * section row.
 */
export function gridReadsAsStatement(fileName: string, grid: RawGrid, sheetName: string): boolean {
  if (!grid || grid.length === 0) return false
  if (hasDebitCreditHeader(grid)) return false
  return (
    isStatementExport(grid) ||
    statementTypeOfGrid(grid, sheetName) !== undefined ||
    statementTypeFromFileName(fileName) !== undefined ||
    hasKnownSectionRow(grid)
  )
}

function fail(
  code: IngestErrorCode,
  detail?: { column?: number; variant?: FailureVariant; colOffset?: number; roles?: [ColumnRole, ColumnRole] },
): IngestError {
  // The picker path hands back no preview (the picker already holds it).
  const { reason, ask } = explainFailure(code, null, detail)
  return new IngestError(reason, code, reason, ask, null)
}

function widthOf(grid: RawGrid): number {
  let w = 0
  for (const r of grid) w = Math.max(w, r?.length ?? 0)
  return w
}

const cellText = (v: unknown): string => (v == null ? '' : String(v)).replace(/ /g, ' ').trim()

/**
 * Read `bytes` with exactly the picked columns. Throws IngestError (no
 * preview) with a plain reason when the choice cannot give usable rows.
 */
export function parseWithColumns(
  fileName: string,
  bytes: ArrayBuffer,
  choice: ColumnChoice,
  opts?: { memory?: IntakeMemory | null; source?: 'picked' | 'remembered' },
): IngestionResult {
  const source = opts?.source ?? 'picked'
  let read: ReturnType<typeof readGrid>
  try {
    read = readGrid(fileName, bytes, choice.sheet ?? null)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw fail(/No ingestion adapter/.test(msg) ? 'unsupported' : 'empty')
  }
  const { grid, sheet } = read
  if (!grid || grid.length === 0) throw fail('empty')
  const colOffset = read.colOffset
  const width = widthOf(grid)

  // 1. Shape.
  const idx = [choice.acct, choice.desc, choice.amount, choice.debit, choice.credit]
  const okIndex = (i: unknown): boolean => Number.isInteger(i) && (i as number) >= -1 && (i as number) < width
  if (!idx.every(okIndex) || !Number.isInteger(choice.headerRow) || choice.headerRow < -1 || choice.headerRow >= grid.length) {
    throw fail('bad-choice', { variant: 'no-rows' })
  }
  const useAmount = choice.amount >= 0
  const useDc = choice.debit >= 0 && choice.credit >= 0
  if (useAmount === useDc || (!useDc && (choice.debit >= 0 || choice.credit >= 0))) {
    throw fail('bad-choice', { variant: 'no-rows' })
  }
  // One column, one job: name the FIRST two roles that share a column + its letter.
  const picked: Array<[ColumnRole, number]> = [
    ['acct', choice.acct],
    ['desc', choice.desc],
    ...(useAmount ? [['amount', choice.amount] as [ColumnRole, number]] : [['debit', choice.debit] as [ColumnRole, number], ['credit', choice.credit] as [ColumnRole, number]]),
  ]
  const used = picked.filter(([, i]) => i >= 0)
  for (let a = 0; a < used.length; a++) {
    for (let b = a + 1; b < used.length; b++) {
      if (used[a]![1] === used[b]![1]) {
        throw fail('bad-choice', { variant: 'same-column', roles: [used[a]![0], used[b]![0]], column: used[a]![1], colOffset: read.colOffset })
      }
    }
  }
  if (choice.acct < 0 && choice.desc < 0) throw fail('bad-choice', { variant: 'no-rows' })

  // 2. Budget guard — the ONLY budget rule on the picker path, both read modes.
  const moneyCols = useAmount ? [choice.amount] : [choice.debit, choice.credit]
  for (const c of moneyCols) {
    const h = stackedHeaderAt(grid, choice.headerRow, c)
    if (h && BUDGETISH.test(h)) throw fail('budget-column', { column: c, colOffset })
  }
  // A BUDGET report (Budget Overview / Budget vs Actuals / a sheet or banner
  // titled Budget): its "Total" and month columns are budget figures, so only
  // a column headed Actual may be read — never a budget imported as actuals,
  // whether a person picked the column or a remembered layout did.
  if (isBudgetReport(grid, sheet ?? '', choice.headerRow, fileName)) {
    for (const c of moneyCols) {
      if (!ACTUAL_HEADER.test(stackedHeaderAt(grid, choice.headerRow, c))) {
        throw fail('budget-column', { column: c, colOffset, variant: 'budget-report' })
      }
    }
  }

  // 2b. An account-number column that is really MONEY (the 2026-10-15 live
  //    garble: "Budget" picked as the account numbers gave rows like
  //    { acct: 2100000, desc: '60100 Salaries - Faculty' }). Refused on every
  //    picker path — picked, remembered, statement or trial balance.
  const acctVerdict = choice.acct >= 0 ? acctColumnVerdict(grid, choice.headerRow, choice.acct) : 'ok'
  if (acctVerdict === 'header-row') throw fail('bad-choice', { variant: 'header-row' })
  if (acctVerdict === 'amounts') {
    throw fail('acct-is-money', {
      column: choice.acct,
      colOffset,
      ...(gridReadsAsStatement(fileName, grid, sheet ?? '') ? { variant: 'can-number' as const } : {}),
    })
  }

  const layout: SavedLayout = {
    sheet,
    headerRow: choice.headerRow,
    acct: choice.acct,
    desc: choice.desc,
    amount: useAmount ? choice.amount : -1,
    debit: useDc ? choice.debit : -1,
    credit: useDc ? choice.credit : -1,
    signature: layoutSignature(grid, choice.headerRow),
    source,
  }

  // 4. A single amount column on a grid that reads as a statement: the walk.
  if (useAmount && gridReadsAsStatement(fileName, grid, sheet ?? '')) {
    const knownSynthetic = opts?.memory?.synthetic
    let detailed: ReturnType<typeof parseStatementGridDetailed>
    try {
      detailed = parseStatementGridDetailed(grid, sheet ?? '', {
        plan: { headerRow: choice.headerRow, acct: choice.acct, desc: choice.desc, value: choice.amount },
        force: true,
        typeHint: statementTypeFromFileName(fileName),
        ...(knownSynthetic ? { knownSynthetic } : {}),
      })
    } catch (e) {
      // The walk's own budget refusal (belt and braces behind the guard above).
      if (e instanceof StatementExportError) throw fail('budget-column', { column: choice.amount, colOffset, variant: 'budget-report' })
      throw e
    }
    const { result, why } = detailed
    if (result) {
      if (result.rows.every((r) => r.total === 0)) throw fail('no-amount', { column: choice.amount, variant: 'zeros', colOffset })
      return { ...result, metadata: { ...result.metadata, layout } }
    }
    // A flat grid whose values TIE is already TB-signed: read it as one.
    if (why !== 'trial-balance') throw fail('bad-choice', { variant: 'no-sign' })
  }

  // 3 / 5. A trial balance.
  if (choice.acct < 0) throw fail('bad-choice', { variant: 'need-acct' })
  const start = choice.headerRow >= 0 ? choice.headerRow + 1 : 0
  const rows: NormalizedRow[] = []
  let textCells = 0
  const money = (v: unknown): number | null => {
    if (cellText(v) === '') return 0
    return parseMoney(v)
  }
  for (let i = start; i < grid.length; i++) {
    const r = grid[i]
    if (!r) continue
    const acctCell = cellText(r[choice.acct])
    if (acctCell === '') continue
    const acct = parseInt(acctCell, 10)
    if (!isPlausibleAcct(acct)) continue
    let desc: string
    if (choice.desc >= 0) {
      desc = cellText(r[choice.desc])
      if (!desc) continue
    } else desc = `Account ${acct}`
    let total: number
    if (useAmount) {
      const m = money(r[choice.amount])
      if (m === null) {
        textCells++
        continue
      }
      total = m
    } else {
      const d = money(r[choice.debit])
      const c = money(r[choice.credit])
      if (d === null || c === null) {
        textCells++
        continue
      }
      total = Math.round((d - c) * 100) / 100
    }
    rows.push({ acct, desc, total: total || 0 })
  }
  if (rows.length === 0) throw fail('bad-choice', { variant: 'no-rows' })
  if (rows.every((r) => r.total === 0)) {
    throw fail('no-amount', { column: useAmount ? choice.amount : choice.debit, variant: 'zeros', colOffset })
  }

  const warnings: string[] = []
  if (textCells > 0) {
    warnings.push(
      textCells === 1
        ? '1 row had text in the amount column and was skipped.'
        : `${textCells} rows had text in the amount column and were skipped.`,
    )
  }
  // A trial balance nets to zero. When the picked columns don't, SAY so (in
  // plain words, letters only) — never let a half-read TB look balanced. A
  // single amount column that is one half of a Debit / Credit pair (by header
  // words or by content) names the other half.
  const net = Math.round(rows.reduce((s, r) => s + r.total, 0) * 100) / 100
  if (Math.abs(net) >= 1) {
    let hint = ''
    if (useAmount) {
      const pair = findDebitCreditPair(grid, {
        bodyStart: start,
        acct: choice.acct,
        exclude: [choice.acct, choice.desc].filter((i) => i >= 0),
      })
      const partner = pair && (pair.debit === choice.amount ? pair.credit : pair.credit === choice.amount ? pair.debit : -1)
      if (partner != null && partner >= 0) {
        hint = ` Column ${columnLetter(partner, colOffset)} looks like the other half — choose "Debit and credit columns".`
      } else if (hasDebitCreditHeader(grid)) {
        hint = ' This file has Debit and Credit columns — choose "Debit and credit columns".'
      }
    }
    warnings.push(
      `These amounts don't balance: they are off by $${Math.abs(net).toLocaleString('en-US', { maximumFractionDigits: 2 })}.${hint}`,
    )
  }
  const above: string[] = []
  for (let i = 0; i < start - 1; i++) for (const c of grid[i] ?? []) if (cellText(c)) above.push(cellText(c))
  const metadata = extractSheetMetadata(above, '', rows.length, {
    ...(sheet ? { sheetName: sheet } : {}),
    net,
    accountCount: rows.length,
  })
  metadata.layout = layout
  return { rows, startRow: start, metadata, ...(warnings.length ? { warnings } : {}) }
}
