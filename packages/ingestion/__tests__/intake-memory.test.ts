// ─────────────────────────────────────────────────────────────
// #32 / #41 S-B(b) — a school's intake memory, derived from its imports'
// metadata: remembered column layouts (applied ONLY after the automatic read
// failed) and the numbers KYRO gave unnumbered P&L accounts last time.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { ingest, buildIntakeMemory, EMPTY_INTAKE_MEMORY, isIngestError, type IngestError } from '../src/index.js'

function workbook(sheets: Record<string, unknown[][]>): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), name)
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

const F5 = [['Sunny Day School'], ['Trial Balance June 30, 2026'], ['Acct', 'Desc', null], [1010, 'Cash', 250000], [1200, 'Tuition Receivable', 40000], [2100, 'Accounts Payable', -30000], [3000, 'Net Assets', -200000], [4000, 'Tuition', -512000], [5000, 'Salaries', 452000]]
const F6 = [['Prepared by the office'], ['Sunny Day School'], ['Trial Balance June 30, 2027'], ['Acct', 'Desc', null], [1010, 'Cash', 260000], [1200, 'Tuition Receivable', 30000], [2100, 'Accounts Payable', -30000], [3000, 'Net Assets', -200000], [4000, 'Tuition', -520000], [5000, 'Salaries', 460000]]

function guessOf(name: string, bytes: ArrayBuffer) {
  try {
    ingest(name, bytes)
  } catch (e) {
    return (e as IngestError).preview!.guess
  }
  throw new Error('read automatically')
}

describe('A32-6 — a picked layout is remembered for the next file laid out the same way', () => {
  const f5 = workbook({ Sheet1: F5 })
  const picked = ingest('Odd TB 6-30-26.xlsx', f5, { columns: guessOf('Odd TB 6-30-26.xlsx', f5) })
  const memory = buildIntakeMemory([picked.metadata])

  it('the memory holds the layout', () => {
    expect(memory.layouts).toHaveLength(1)
    expect(memory.layouts[0]).toMatchObject({ headerRow: 2, acct: 0, desc: 1, amount: 2, source: 'picked', signature: 'w=3:acct|desc' })
  })
  it('a re-dated, re-valued file with an extra banner row reads automatically, marked remembered', () => {
    const r = ingest('Odd TB 6-30-27.xlsx', workbook({ Sheet1: F6 }), { memory })
    expect(r.rows).toHaveLength(6)
    expect(r.rows[0]).toEqual({ acct: 1010, desc: 'Cash', total: 260000 })
    expect(r.metadata!.layout).toMatchObject({ source: 'remembered', headerRow: 3 })
  })
  it('without memory the same file still fails (memory is the only difference)', () => {
    expect(() => ingest('Odd TB 6-30-27.xlsx', workbook({ Sheet1: F6 }))).toThrow(/no amount column/)
  })
  it('a stale layout that throws falls through to the normal IngestError', () => {
    const stale = { layouts: [{ ...memory.layouts[0]!, amount: 1 }], synthetic: {} }
    let err: unknown
    try {
      ingest('Odd TB 6-30-27.xlsx', workbook({ Sheet1: F6 }), { memory: stale })
    } catch (e) {
      err = e
    }
    expect(isIngestError(err)).toBe(true)
    expect((err as IngestError).code).toBe('no-amount')
  })
  it('a different header layout is never matched', () => {
    const other = [['School'], ['Number', 'Name', null], [1010, 'Cash', 1], [4000, 'Tuition', -1]]
    expect(() => ingest('x.xlsx', workbook({ Sheet1: other }), { memory })).toThrow()
  })
})

describe('buildIntakeMemory — defensive over client-written metadata', () => {
  const good = { sheet: 'Sheet1', headerRow: 2, acct: 0, desc: 1, amount: 2, debit: -1, credit: -1, signature: 'w=3:acct|desc', source: 'picked' }
  it('validates layouts, newest per signature wins, caps at 20', () => {
    const m = buildIntakeMemory([
      { layout: { ...good, amount: 3 } },
      { layout: good },
      { layout: { ...good, signature: null } },
      { layout: { ...good, signature: 'w=4:a|b', headerRow: 5000 } },
      { layout: { ...good, signature: 'w=4:a|c', acct: 1.5 } },
      { layout: { ...good, signature: 'w=4:a|d', source: 'magic' } },
      { layout: { ...good, signature: 'x'.repeat(301) } },
      'nonsense', null, 42, [],
      { source: 'quickbooks', layout: { ...good, signature: 'w=9:qbo|x' } },
    ])
    expect(m.layouts).toHaveLength(1)
    expect(m.layouts[0]!.amount).toBe(3)
    const many = Array.from({ length: 30 }, (_, i) => ({ layout: { ...good, signature: `w=3:s${i}|x` } }))
    expect(buildIntakeMemory(many).layouts).toHaveLength(20)
  })
  it('pins only P&L synthesized numbers in their own block; newest wins per key; a claimed number is not reused', () => {
    const newer = { statement: { synthesized: [
      { acct: 45187, name: 'Tuition', section: 'revenue', source: 'user' },
      { acct: 100, name: 'Checking', section: 'asset' },
      { acct: 63851, name: 'Salaries', section: 'expense' },
    ] } }
    const older = { statement: { synthesized: [
      { acct: 41111, name: 'Tuition', section: 'revenue' }, // older pin for the same key → ignored
      { acct: 63851, name: 'Wages', section: 'expense' }, // number claimed by the newer "Salaries" → ignored
      { acct: 25000, name: 'Gifts', section: 'revenue' }, // not in the revenue block → ignored
      { acct: 43064, name: 'Fees', section: 'revenue' },
    ] } }
    const m = buildIntakeMemory([newer, older])
    expect(m.synthetic).toEqual({
      'revenue:tuition': { acct: 45187, section: 'revenue', name: 'Tuition' },
      'expense:salaries': { acct: 63851, section: 'expense', name: 'Salaries' },
      'revenue:fees': { acct: 43064, section: 'revenue', name: 'Fees' },
    })
  })
  it('legacy metadata (no source field) bootstraps pins; repeats get #2 keys', () => {
    const m = buildIntakeMemory([{ statement: { synthesized: [
      { acct: 61000, name: 'Supplies', section: 'expense' },
      { acct: 61001, name: 'Supplies', section: 'expense' },
    ] } }])
    expect(Object.keys(m.synthetic)).toEqual(['expense:supplies', 'expense:supplies#2'])
  })
  it('empty input → the empty memory', () => {
    expect(buildIntakeMemory([])).toEqual({ layouts: [], synthetic: {} })
    expect(EMPTY_INTAKE_MEMORY).toEqual({ layouts: [], synthetic: {} })
    expect(buildIntakeMemory('x' as never)).toEqual({ layouts: [], synthetic: {} })
  })
})
