// ─────────────────────────────────────────────────────────────
// Statement-export adapter SAFETY suite — the adversarial-review findings on
// e49ae91 / a8f16e1, each pinned with the CORRECT expectation. The one rule
// every blocker reduces to: a plain trial balance is NEVER hijacked by the
// statement walk — not by its file name (B1), not by its group/Total rows
// (B2), not by the registry's `force` fallback (B3). Then the SHOULDs: zeros
// kept (S1), hash-stable numbering (S2), budget-only refused (S3), multi-sheet
// statements signed (S4), years are names (S5), nonprofit equity row (S6),
// period line stays in the banner (S7), only the current FY claims cy (S8),
// "Total X" as an account (S9), money edge cases (S10).
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import {
  ingest,
  classifyRole,
  resolveRoles,
  parseTrialBalance,
  listTrialBalanceSheets,
  listStatementSheets,
  isStatementPair,
  parseStatementGrid,
  parseStatementWorkbook,
  isStatementExport,
  hasDebitCreditHeader,
  statementTypeFromFileName,
  QBO_REVENUE_BASE,
  QBO_EXPENSE_BASE,
  syntheticOffset,
} from '../src/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const sampleDir = resolve(here, '..', '..', '..', 'sample-data')
const SAMPLE_TBS = ['TB_CurrentYear_FY26.xlsx', 'TB_PriorYear_FY25.xlsx', 'TB_AuditedFYEnd_FY25.xlsx'] as const

function loadSample(name: string): ArrayBuffer {
  const buf = readFileSync(resolve(sampleDir, name))
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
}
function workbook(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
function gridOf(rows: unknown[][]): unknown[][] {
  const wb = XLSX.read(new Uint8Array(workbook({ S: rows })), { type: 'array' })
  return XLSX.utils.sheet_to_json(wb.Sheets['S']!, { header: 1, defval: null }) as unknown[][]
}
function firstGrid(bytes: ArrayBuffer): unknown[][] {
  const wb = XLSX.read(new Uint8Array(bytes), { type: 'array' })
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]!]!, { header: 1, defval: null }) as unknown[][]
}
const sum = (rows: Array<{ total: number }>): number => Math.round(rows.reduce((s, r) => s + r.total, 0) * 100) / 100
const rev = (name: string): number => QBO_REVENUE_BASE + syntheticOffset(name)
const exp = (name: string): number => QBO_EXPENSE_BASE + syntheticOffset(name)

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** The real-shaped 2026-10-14 customer export: no banner, stacked `Actual`, every row 4xxxx/6xxxx, zeros included. */
const CUSTOMER: unknown[][] = [
  [],
  [null, null, 'Actual'],
  ['Acct', 'Desc', null],
  [40000, '40000 Income', -26301.61],
  [40009, '40009 Discounts and Assistance', 53550],
  [40200, '40200 Income - Monthly Tuition Installments', 488257.5],
  [40201, '40201 Deferred Income - July', 0],
  [40202, '40202 Deferred Income - August', 0],
  [60100, '60100 Salaries', 300000],
  [50100, '50100 Cost of Books Sold', 1200],
  [70100, '70100 Depreciation', 900],
]
const CUSTOMER_NAME = 'CMA Statement of Activity Budget vs Actuals 6-30-26.xlsx'

/** A plain TB with Debit | Credit | Total. */
const TB: unknown[][] = [
  ['Trial Balance'],
  ['Account', 'Description', 'Debit', 'Credit', 'Total'],
  [1010, 'Cash', 500, 0, 500],
  [4000, 'Tuition', 0, 500, -500],
]

/** A SECTIONED trial balance: group rows + "Total <Group>" rows + Debit | Credit | Total. Already TB-signed. */
const SECTIONED_TB: unknown[][] = [
  ['Trial Balance'],
  ['As of June 30, 2026'],
  ['Account', 'Description', 'Debit', 'Credit', 'Total'],
  [null, 'Assets'],
  [1010, 'Cash', 500, 0, 500],
  [null, 'Total Assets', 500, 0, 500],
  [null, 'Income'],
  [4000, 'Tuition', 0, 500, -500],
  [null, 'Total Income', 0, 500, -500],
]

const monthPl = (period: string, t: number): unknown[][] => [
  ['Sample School'],
  ['Profit and Loss'],
  [period],
  [],
  ['Acct', 'Desc', 'Total'],
  [null, 'Income'],
  [40100, 'Tuition', t],
  [null, 'Total Income', t],
  [null, 'Net Income', t],
]

// ── B1 · the file-name hint never re-signs a Debit | Credit grid ──────────────

describe('B1 — a plain trial balance named like a statement is still a trial balance', () => {
  it('"balance sheet TB.xlsx" holding a Debit | Credit | Total TB keeps TB signs and no statement metadata', () => {
    expect(statementTypeFromFileName('balance sheet TB.xlsx')).toBe('bs') // the hint IS derived…
    const r = ingest('balance sheet TB.xlsx', workbook({ Sheet1: TB }))
    expect(r.metadata?.statement).toBeUndefined() // …and ignored
    expect(r.rows).toEqual([
      { acct: 1010, desc: 'Cash', total: 500 },
      { acct: 4000, desc: 'Tuition', total: -500 },
    ])
  })

  it('"Income Statement FY26.xlsx" holding a Debit | Credit TB (no Total column) is debit − credit, every row kept', () => {
    const noTotal = TB.map((r) => r.slice(0, 4))
    const r = ingest('Income Statement FY26.xlsx', workbook({ Sheet1: noTotal }))
    expect(r.metadata?.statement).toBeUndefined()
    expect(r.rows.find((x) => x.acct === 4000)!.total).toBe(-500)
    expect(r.rows).toHaveLength(2)
  })

  it('"Profit and Loss TB.xlsx" with an expense credit: the Credit column is not dropped', () => {
    const r = ingest(
      'Profit and Loss TB.xlsx',
      workbook({
        Sheet1: [
          ['Trial Balance'],
          ['Account', 'Description', 'Debit', 'Credit'],
          [1010, 'Cash', 500, 0],
          [4000, 'Tuition', 0, 800],
          [5000, 'Salaries', 300, 0],
        ],
      }),
    )
    expect(r.metadata?.statement).toBeUndefined()
    expect(r.rows).toEqual([
      { acct: 1010, desc: 'Cash', total: 500 },
      { acct: 4000, desc: 'Tuition', total: -800 },
      { acct: 5000, desc: 'Salaries', total: 300 },
    ])
  })

  it('the hint is also ignored at the grid level — the adapter returns null, whatever the hint or force', () => {
    const grid = gridOf(TB)
    expect(hasDebitCreditHeader(grid)).toBe(true)
    expect(parseStatementGrid(grid, 'Sheet1', { typeHint: 'bs' })).toBeNull()
    expect(parseStatementGrid(grid, 'Sheet1', { typeHint: 'pl', force: true })).toBeNull()
    expect(parseStatementGrid(grid, 'Balance Sheet')).toBeNull() // even a statement-named SHEET
  })

  it('every sample-data TB (Number | Description | Debit | Credit | Total) parses plain, byte-identical, under a statement file name too', () => {
    for (const name of SAMPLE_TBS) {
      const bytes = loadSample(name)
      expect(hasDebitCreditHeader(firstGrid(bytes))).toBe(true)
      expect(isStatementExport(firstGrid(bytes))).toBe(false)
      const plain = parseTrialBalance(bytes)
      for (const asName of [name, 'Balance Sheet.xlsx', 'Statement of Activity Budget vs Actuals 6-30-26.xlsx']) {
        const r = ingest(asName, bytes)
        expect(r.rows).toEqual(plain.rows)
        expect(r.metadata?.statement).toBeUndefined()
      }
      expect(listStatementSheets(bytes, { typeHint: 'bva' })).toEqual([])
      expect(plain.rows.some((r) => r.total < 0)).toBe(true) // credits stayed credits — the walk would have flipped them
    }
  })
})

// ── B2 · structural detection never claims a sectioned TB ────────────────────

describe('B2 — a sectioned trial balance (group rows + Total rows) is not a statement', () => {
  it('isStatementExport is false and the facade keeps the TB signs and every row', () => {
    expect(isStatementExport(gridOf(SECTIONED_TB))).toBe(false)
    const r = ingest('TB_FY26.xlsx', workbook({ Sheet1: SECTIONED_TB }))
    expect(r.metadata?.statement).toBeUndefined()
    expect(r.rows).toEqual([
      { acct: 1010, desc: 'Cash', total: 500 },
      { acct: 4000, desc: 'Tuition', total: -500 },
    ])
  })

  it('a section row must be a KNOWN P&L / BS label — arbitrary group names plus a Total row are not evidence', () => {
    const grouped: unknown[][] = [
      ['Chart'],
      [null, 'Total'],
      ['Campus A'],
      ['   Cash', 100],
      ['Total Campus A', 100],
    ]
    expect(isStatementExport(gridOf(grouped))).toBe(false)
  })
})

// ── B3 · the force fallback needs real statement evidence ────────────────────

describe('B3 — the "plain adapter found nothing" fallback never signs a flat grid by leading digit', () => {
  const UNLABELED: unknown[][] = [
    ['Trial Balance FY26'],
    ['Acct', 'Desc', null],
    [1010, 'Cash', 500],
    [4000, 'Tuition', -500],
  ]

  it('the plain adapter’s own error surfaces instead of a silently re-signed import', () => {
    expect(() => parseTrialBalance(workbook({ Sheet1: UNLABELED }))).toThrow(/no amount column/)
    expect(() => ingest('TB_FY26.xlsx', workbook({ Sheet1: UNLABELED }))).toThrow(/no amount column/)
    expect(parseStatementGrid(gridOf(UNLABELED), 'Sheet1', { force: true })).toBeNull()
  })

  it('…but a known section row IS evidence, so a title-less, Total-less P&L still walks under force', () => {
    const sectioned: unknown[][] = [
      [null, 'Total'],
      ['Income'],
      ['   Tuition', 1000],
      ['Expenses'],
      ['   Salaries', 400],
    ]
    expect(isStatementExport(gridOf(sectioned))).toBe(false) // no Total / computed row
    expect(parseStatementGrid(gridOf(sectioned), 'Sheet1')).toBeNull()
    const forced = parseStatementGrid(gridOf(sectioned), 'Sheet1', { force: true })!
    expect(forced.rows).toEqual([
      { acct: rev('Tuition'), desc: 'Tuition', total: -1000 },
      { acct: exp('Salaries'), desc: 'Salaries', total: 400 },
    ])
  })
})

// ── S1 · zeros kept; S2 · hash numbering (customer file) ──────────────────────

describe('S1 — zero-value leaves are kept (the customer file keeps its full chart)', () => {
  it('the customer export yields every row, zeros included, signed by block, column Actual, period from the name', () => {
    const r = ingest(CUSTOMER_NAME, workbook({ Sheet1: CUSTOMER }))
    expect(r.metadata?.statement?.type).toBe('bva')
    expect(r.metadata?.statement?.column).toBe('Actual')
    expect(r.metadata?.periodEndDate).toBe('2026-06-30')
    expect(r.rows).toHaveLength(CUSTOMER.length - 3)
    expect(r.rows.find((x) => x.acct === 40000)!.total).toBeCloseTo(26301.61, 2)
    expect(r.rows.find((x) => x.acct === 40009)!.total).toBe(-53550)
    expect(r.rows.find((x) => x.acct === 40200)!.total).toBe(-488257.5)
    expect(r.rows.find((x) => x.acct === 40201)).toEqual({ acct: 40201, desc: '40201 Deferred Income - July', total: 0 })
    expect(Object.is(r.rows.find((x) => x.acct === 40202)!.total, -0)).toBe(false) // never a signed zero
    expect(r.rows.find((x) => x.acct === 60100)!.total).toBe(300000)
    expect(r.rows.find((x) => x.acct === 50100)!.total).toBe(1200)
    expect(r.rows.find((x) => x.acct === 70100)!.total).toBe(900)
    expect(r.warnings).toBeUndefined()
  })

  it('a balance-sheet account inside a P&L-typed flat export is skipped WITH a warning (never silently)', () => {
    const withBs = [...CUSTOMER, [24100, '24100 Deferred Income - Fall', 5000]]
    const r = ingest(CUSTOMER_NAME, workbook({ Sheet1: withBs }))
    expect(r.rows.some((x) => x.acct === 24100)).toBe(false)
    expect(r.warnings?.some((w) => /skipped: 24100 Deferred Income/.test(w))).toBe(true)
  })
})

describe('S2 — synthetic numbers are a hash of the name, so re-exports do not re-key', () => {
  it('an account going 0 → non-zero leaves every other number alone', () => {
    const base: unknown[][] = [
      ['Profit and Loss'], ['July 2025 - June 2026'], [], [null, 'Total'], ['Income'],
      ['   Fees', 0], ['   Tuition', 1000], ['Total Income', 1000], ['Net Income', 1000],
    ]
    const later = base.map((r) => (r[0] === '   Fees' ? ['   Fees', 5] : r))
    const a = parseStatementGrid(gridOf(base), 'P&L')!
    const b = parseStatementGrid(gridOf(later), 'P&L')!
    expect(a.rows.map((r) => r.acct)).toEqual(b.rows.map((r) => r.acct))
    expect(a.rows.find((r) => r.desc === 'Fees')!.total).toBe(0)
    expect(b.rows.find((r) => r.desc === 'Fees')!.total).toBe(-5)
    expect(a.metadata.statement.synthesized.map((s) => s.acct)).toEqual([rev('Fees'), rev('Tuition')])
  })
})

// ── S4 · multi-sheet statement workbooks ──────────────────────────────────────

describe('S4 — a workbook of monthly Statement-of-Activity tabs is signed as statements', () => {
  const bytes = workbook({ 'Jul 2025': monthPl('July 2025', 100), 'Aug 2025': monthPl('August 2025', 200) })

  it('listStatementSheets returns one SIGNED result per sheet (the fan-out callers consult it first)', () => {
    const sheets = listStatementSheets(bytes)
    expect(sheets).toHaveLength(2)
    expect(sheets.map((s) => s.metadata.sheet)).toEqual(['Jul 2025', 'Aug 2025'])
    expect(sheets[0]!.rows).toEqual([{ acct: 40100, desc: 'Tuition', total: -100 }]) // revenue = credit
    expect(sheets[1]!.rows).toEqual([{ acct: 40100, desc: 'Tuition', total: -200 }])
    expect(sheets.map((s) => s.metadata.periodEndDate)).toEqual(['2025-07-31', '2025-08-31'])
    expect(isStatementPair(sheets)).toBe(false)
    // The plain enumerator would read the same tabs debit-positive — which is why it is consulted SECOND.
    expect(listTrialBalanceSheets(bytes)[0]!.rows[0]!.total).toBe(100)
  })

  it('parseStatementWorkbook imports the first sheet and WARNS about the rest', () => {
    const r = parseStatementWorkbook(bytes)!
    expect(r.metadata.sheet).toBe('Jul 2025')
    expect(r.warnings?.some((w) => /2 statement sheets.*only "Jul 2025".*"Aug 2025"/.test(w))).toBe(true)
  })

  it('a P&L + Balance Sheet pair is still ONE merged full TB, not two half-candidates', () => {
    const bs: unknown[][] = [
      ['Balance Sheet'], ['As of June 30, 2026'], [], [null, 'Total'],
      ['ASSETS'], ['   Checking', 100], ['TOTAL ASSETS', 100],
      ['LIABILITIES AND EQUITY'], ['   Equity'], ['      Net Income', 100], ['   Total Equity', 100], ['TOTAL LIABILITIES AND EQUITY', 100],
    ]
    const pair = workbook({ 'Profit and Loss': monthPl('July 2025 - June 2026', 100), 'Balance Sheet': bs })
    expect(isStatementPair(listStatementSheets(pair))).toBe(true)
    const r = parseStatementWorkbook(pair)!
    expect(r.metadata.statement.partial).toBe('full')
    expect(r.warnings).toBeUndefined()
    expect(sum(r.rows)).toBe(0)
  })

  it('a TB sheet beside a statement sheet is never returned as a statement; a refused sheet is reported', () => {
    const warnings: string[] = []
    const mixed = workbook({
      TB: SECTIONED_TB,
      'Budget Overview': [
        ['Budget Overview: FY26'], ['July 2025 - June 2026'], [], [null, 'Jul 2025', 'Total'],
        ['Income'], ['   Tuition', 1, 1], ['Total Income', 1, 1], ['Net Income', 1, 1],
      ],
      'P&L': monthPl('July 2025 - June 2026', 100),
    })
    const sheets = listStatementSheets(mixed, { onWarning: (w) => warnings.push(w) })
    expect(sheets.map((s) => s.metadata.sheet)).toEqual(['P&L'])
    expect(warnings).toEqual([expect.stringMatching(/Sheet "Budget Overview" was skipped: Budget vs Actuals export has no Actual column/)])
    expect(parseStatementWorkbook(mixed)!.warnings).toEqual([expect.stringMatching(/"Budget Overview" was skipped/)])
  })
})

// ── S5 · a leading year is a name ─────────────────────────────────────────────

describe('S5 — "2026 Annual Fund" is a name, not account 2026', () => {
  it('synthesises the number for year-led names and ignores a leading number when an Acct column exists', () => {
    const r = parseStatementGrid(
      gridOf([
        ['Profit and Loss'], ['July 2025 - June 2026'], [], [null, 'Total'], ['Income'],
        ['   2026 Annual Fund', 1000], ['   2025-26 Tuition', 2000], ['   4000 - Fees', 10], ['   2026 - Gala', 20],
        ['Total Income', 3030], ['Net Income', 3030],
      ]),
      'P&L',
    )!
    expect(r.rows).toEqual([
      { acct: rev('2026 Annual Fund'), desc: '2026 Annual Fund', total: -1000 },
      { acct: rev('2025-26 Tuition'), desc: '2025-26 Tuition', total: -2000 },
      { acct: 4000, desc: '4000 - Fees', total: -10 },
      { acct: 2026, desc: '2026 - Gala', total: -20 }, // an explicit separator says it IS an account
    ])
    // With an explicit Acct column the name's leading number is never read; "4000-10" → 4000.
    const explicit = parseStatementGrid(
      gridOf([
        ['Statement of Activity'], ['July 2025 - June 2026'], [], ['Acct', 'Desc', 'Total'],
        [null, 'Income'], ['4000-10', '2026 Annual Fund', 1000], [null, '1999 Legacy Gift', 50], [null, 'Total Income', 1050],
      ]),
      'SoA',
    )!
    expect(explicit.rows).toEqual([
      { acct: 4000, desc: '2026 Annual Fund', total: -1000 },
      { acct: rev('1999 Legacy Gift'), desc: '1999 Legacy Gift', total: -50 },
    ])
  })
})

// ── S6 · nonprofit Balance Sheet equity row ───────────────────────────────────

describe('S6 — a nonprofit Balance Sheet’s "Net Revenue" / "Change in Net Assets" is the equity result row', () => {
  const bs = (resultLabel: string): unknown[][] => [
    ['Sample School'], ['Statement of Financial Position'], ['As of June 30, 2026'], [], [null, 'Total'],
    ['ASSETS'], ['   Bank Accounts'], ['      Checking', 1000], ['   Total Bank Accounts', 1000], ['TOTAL ASSETS', 1000],
    ['LIABILITIES AND EQUITY'], ['   Equity'], ['      Opening Balance Equity', 400], [`      ${resultLabel}`, 600],
    ['   Total Equity', 1000], ['TOTAL LIABILITIES AND EQUITY', 1000],
  ]

  it.each(['Net Revenue', 'Net Income (Loss)', 'Change in Net Assets', 'Net Income'])('BS-only upload balances with "%s"', (label) => {
    const r = parseStatementGrid(gridOf(bs(label)), 'SFP')!
    expect(r.rows.find((x) => x.desc === label)).toEqual({ acct: 300, desc: label, total: -600 })
    expect(sum(r.rows)).toBe(0)
  })

  it('…and the same row is dropped when the BS is merged with a P&L', () => {
    const pl: unknown[][] = [
      ['Statement of Activity'], ['July 2025 - June 2026'], [], [null, 'Total'],
      ['Revenue'], ['   Tuition', 600], ['Total Revenue', 600], ['Net Revenue', 600],
    ]
    const r = parseStatementWorkbook(workbook({ SoA: pl, SFP: bs('Net Revenue') }))!
    expect(r.metadata.statement.partial).toBe('full')
    expect(r.rows.some((x) => x.desc === 'Net Revenue')).toBe(false)
    expect(r.metadata.statement.balancePlug).toBeNull()
    expect(sum(r.rows)).toBe(0)
  })
})

// ── S7 · the period line stays in the banner ──────────────────────────────────

describe('S7 — a one-cell "July 2025 - June 2026" row is the period line, not a header', () => {
  it('a header-less export still reads its period and walks its opening section', () => {
    const r = parseStatementGrid(
      gridOf([
        ['Sample School'], ['Profit and Loss'], ['July 2025 - June 2026'],
        ['Income'], ['   Tuition', 1000], ['Total Income', 1000], ['Net Income', 1000],
      ]),
      'P&L',
    )!
    expect(r.metadata.periodEndDate).toBe('2026-06-30')
    expect(r.metadata.statement.periodStart).toBe('2025-07-01')
    expect(r.rows).toEqual([{ acct: rev('Tuition'), desc: 'Tuition', total: -1000 }])
  })

  it('a multi-cell month row ("Jul 2025 | Aug 2025 | Total") is still the header', () => {
    const r = parseStatementGrid(
      gridOf([
        ['Profit and Loss'], ['July - August 2025'], [], [null, 'Jul 2025', 'Aug 2025', 'Total'],
        ['Income'], ['   Tuition', 1, 2, 3], ['Total Income', 1, 2, 3], ['Net Income', 1, 2, 3],
      ]),
      'P&L',
    )!
    expect(r.metadata.statement.column).toBe('Total')
    expect(r.rows).toEqual([{ acct: rev('Tuition'), desc: 'Tuition', total: -3 }])
    expect(r.metadata.periodEndDate).toBe('2025-08-31')
  })
})

// ── S8 · only the current FY claims cy ────────────────────────────────────────

describe('S8 — two statements (current FY + just-closed FY) resolve to cy/py, never duplicate-cy', () => {
  it('per-file: current FY → cy; just-closed → unknown with its explicit date; batch → cy/py', () => {
    const mk = (range: string): unknown[][] => [
      ['Sample School'], ['Statement of Activity'], [range], [], [null, 'Total'], ['Income'], ['   Tuition', 10], ['Total Income', 10], ['Net Income', 10],
    ]
    const now = new Date('2026-10-14T12:00:00Z') // FY2027
    const a = parseStatementGrid(gridOf(mk('July 2025 - June 2026')), 'SoA')!
    const b = parseStatementGrid(gridOf(mk('July 2026 - September 2026')), 'SoA')!
    const ca = classifyRole({ fileName: 'SoA FY26.xlsx', metadata: a.metadata, now })
    const cb = classifyRole({ fileName: 'SoA Q1 FY27.xlsx', metadata: b.metadata, now })
    expect(ca.role).toBe('unknown')
    expect(ca.signals.periodEndDate).toBe('2026-06-30')
    expect(cb.role).toBe('cy')
    const res = resolveRoles([
      { id: 'a', role: ca.role, periodEndDate: a.metadata.periodEndDate, confidence: ca.confidence },
      { id: 'b', role: cb.role, periodEndDate: b.metadata.periodEndDate, confidence: cb.confidence },
    ])
    expect(res.slots).toEqual({ cy: 'b', py: 'a' })
    expect(res.conflicts).toEqual([])
    // A LONE just-closed statement still lands in cy through the resolver's lone-file default.
    const lone = resolveRoles([{ id: 'a', role: ca.role, periodEndDate: a.metadata.periodEndDate, confidence: ca.confidence }])
    expect(lone.slots.cy).toBe('a')
  })
})

// ── S9 · "Total X" as an account; parent with its own amount ──────────────────

describe('S9 — "Total <X>" is a subtotal only when X is a section or a leaf already seen', () => {
  it('an account literally named "Total Compensation" is a leaf', () => {
    const r = parseStatementGrid(
      gridOf([
        ['Profit and Loss'], ['July 2025 - June 2026'], [], [null, 'Total'],
        ['Expenses'], ['   Total Compensation', 1000], ['   Supplies', 50], ['Total Expenses', 1050], ['Net Income', -1050],
      ]),
      'P&L',
    )!
    expect(r.rows).toEqual([
      { acct: exp('Total Compensation'), desc: 'Total Compensation', total: 1000 },
      { acct: exp('Supplies'), desc: 'Supplies', total: 50 },
    ])
    expect(sum(r.rows)).toBe(1050)
  })

  it('a parent printed with its own amount, then children, then "Total Parent" keeps the parent exactly once', () => {
    const r = parseStatementGrid(
      gridOf([
        ['Profit and Loss'], ['July 2025 - June 2026'], [], [null, 'Total'],
        ['Income'], ['   Tuition', 100], ['      Day Tuition', 500], ['      Boarding Tuition', 400], ['   Total Tuition', 1000],
        ['Total Income', 1000], ['Net Income', 1000],
      ]),
      'P&L',
    )!
    expect(r.rows.map((x) => [x.desc, x.total])).toEqual([['Tuition', -100], ['Day Tuition', -500], ['Boarding Tuition', -400]])
    expect(sum(r.rows)).toBe(-1000)
  })
})

// ── S10 · money edge cases in the walk ────────────────────────────────────────

describe('S10 — unparseable text in the value column is a bad leaf, not a section opener', () => {
  it('warns and skips the row; the rows after it keep their section', () => {
    const r = parseStatementGrid(
      gridOf([
        ['Profit and Loss'], ['July 2025 - June 2026'], [], [null, 'Total'],
        ['Income'], ['   Tuition', 'N/A'], ['   Fees', '$(1,234.00)'], ['Total Income', -1234], ['Net Income', -1234],
      ]),
      'P&L',
    )!
    expect(r.rows).toEqual([{ acct: rev('Fees'), desc: 'Fees', total: 1234 }]) // −1234 revenue → +1234 debit
    expect(r.warnings).toEqual([expect.stringMatching(/1 row\(s\) had text instead of an amount.*Tuition = "N\/A"/)])
  })
})
