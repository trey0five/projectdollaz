// ─────────────────────────────────────────────────────────────
// #41 S-B(b) — synthetic numbers for unnumbered P&L rows are a name hash with
// order-dependent probing on collision, so two colliding accounts could swap
// numbers between exports. With the school's memory, each keeps the number it
// had last time; a new name never takes a remembered number.
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import {
  parseStatementGrid,
  buildIntakeMemory,
  syntheticOffset,
  syntheticKeys,
  QBO_REVENUE_BASE,
  type IntakeMemory,
} from '../src/index.js'

function gridOf(rows: unknown[][]): unknown[][] {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'S')
  const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  const back = XLSX.read(new Uint8Array(bytes), { type: 'array' })
  return XLSX.utils.sheet_to_json(back.Sheets['S']!, { header: 1, defval: null }) as unknown[][]
}
function pl(income: Array<[string, number]>, expense: Array<[string, number]> = [['Salaries', 100]]): unknown[][] {
  const ti = income.reduce((s, [, v]) => s + v, 0)
  const te = expense.reduce((s, [, v]) => s + v, 0)
  return [
    ['Profit and Loss'], ['July 2025 - June 2026'], [], ['', 'Total'],
    ['Income'], ...income.map(([n, v]) => [`   ${n}`, v]), ['Total Income', ti],
    ['Expenses'], ...expense.map(([n, v]) => [`   ${n}`, v]), ['Total Expenses', te],
    ['Net Income', ti - te],
  ]
}
const parse = (rows: unknown[][], memory?: IntakeMemory) =>
  parseStatementGrid(gridOf(rows), 'P&L', memory ? { knownSynthetic: memory.synthetic } : {})!
const acctOf = (r: ReturnType<typeof parse>, name: string) => r.rows.find((x) => x.desc === name)!.acct

/** Two names whose hashes collide (brute force). */
function collidingPair(): [string, string] {
  const seen = new Map<number, string>()
  for (let i = 0; i < 100_000; i++) {
    const name = `Program ${i}`
    const off = syntheticOffset(name)
    const prev = seen.get(off)
    if (prev) return [prev, name]
    seen.set(off, name)
  }
  throw new Error('no collision found')
}
const [A, B] = collidingPair()

describe('A41-SB — stable synthetic numbers', () => {
  const first = parse(pl([[A, 10], [B, 20]]))
  const a1 = acctOf(first, A)
  const b1 = acctOf(first, B)
  const memory = buildIntakeMemory([first.metadata])

  it('without memory, a re-ordered export SWAPS the colliding pair (the documented hazard)', () => {
    expect(a1).toBe(QBO_REVENUE_BASE + syntheticOffset(A))
    expect(b1).toBe(a1 + 1)
    const swapped = parse(pl([[B, 20], [A, 10]]))
    expect(acctOf(swapped, B)).toBe(a1)
    expect(acctOf(swapped, A)).toBe(b1)
  })

  it('with memory each keeps its export-1 number, marked remembered', () => {
    const second = parse(pl([[B, 20], [A, 10]]), memory)
    expect(acctOf(second, A)).toBe(a1)
    expect(acctOf(second, B)).toBe(b1)
    const synth = second.metadata.statement.synthesized
    expect(synth.find((s) => s.name === A)!.source).toBe('remembered')
    expect(synth.find((s) => s.name === B)!.source).toBe('remembered')
    expect(synth.find((s) => s.name === 'Salaries')!.source).toBe('remembered')
  })

  it('a NEW name never takes a remembered number', () => {
    // A new account hashing onto A's slot, printed FIRST.
    let intruder = ''
    for (let i = 0; i < 200_000 && !intruder; i++) {
      const n = `Grant ${i}`
      if (syntheticOffset(n) === syntheticOffset(A)) intruder = n
    }
    expect(intruder).not.toBe('')
    const r = parse(pl([[intruder, 5], [B, 20], [A, 10]]), memory)
    expect(acctOf(r, A)).toBe(a1)
    expect(acctOf(r, B)).toBe(b1)
    expect([a1, b1]).not.toContain(acctOf(r, intruder))
    expect(r.metadata.statement.synthesized.find((s) => s.name === intruder)!.source).toBeUndefined()
  })

  it('a remembered number now used by an explicit account falls back, with the plain warning', () => {
    const rows = pl([[`${a1} Explicit Line`, 1], [A, 10]])
    const r = parse(rows, memory)
    expect(acctOf(r, A)).not.toBe(a1)
    expect(r.warnings).toContain(
      `"${A}" was ${a1} last time, but that number is now used by another account; it is ${acctOf(r, A)} this time — check its category.`,
    )
  })

  it('duplicate names get #2 keys; balance-sheet entries are never keyed', () => {
    expect(syntheticKeys([
      { acct: 41000, name: 'Fees', section: 'revenue' },
      { acct: 41001, name: 'Fees', section: 'revenue' },
      { acct: 100, name: 'Checking', section: 'asset' },
    ])).toEqual(['revenue:fees', 'revenue:fees#2', null])
  })

  it('with no memory the numbering is byte-identical to before (no source fields)', () => {
    const again = parse(pl([[A, 10], [B, 20]]))
    expect(again.rows).toEqual(first.rows)
    expect(again.metadata.statement.synthesized.every((s) => s.source === undefined)).toBe(true)
  })
})
