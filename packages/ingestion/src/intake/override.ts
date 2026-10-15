// ─────────────────────────────────────────────────────────────
// Reading a file with the columns a PERSON picked (#32).
//
// The picker supplies columns, never a verdict on what the file is: whether
// the grid is walked as a QuickBooks statement is still decided by the
// existing evidence (banner, file name, section rows), and a Debit | Credit
// grid — or a person choosing Debit + Credit columns — is ALWAYS a trial
// balance. Picked budget / variance / prior-year columns are refused, a
// column of zeros is refused, and text in an amount cell skips the row (it is
// never read as 0).
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
import { isPlausibleAcct } from '../adapters/excelAdapter.js'
import { extractSheetMetadata } from '../metadata.js'
import { IngestError, type IngestErrorCode } from './errors.js'
import { columnLetter, explainFailure, findDebitCreditPair, layoutSignature, readGrid, type ColumnRole, type FailureVariant } from './preview.js'

/** A header that names budget, variance, percentage or prior-year figures — never actual balances. */
export const BUDGETISH = /budget|variance|%|percent|\bprior\b|last\s*year|\bpy\b/i

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
