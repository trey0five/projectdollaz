// ─────────────────────────────────────────────────────────────────────────────
// What the intake WRITES to a school's mapping — mounted for real.
//
//   • N2: the review popup's save — the person's own picks are a normal merge
//     (never silently dropped by fill-only); KYRO's untouched suggestions are
//     fill-only. One request after the other, never concurrent.
//   • S1: renumbering an account KYRO numbered carries its category to the new
//     number FILL-ONLY — the browser judges "no entry yet" against its own
//     chart, not the school's stored picks, and the category is often an
//     unsaved auto-sort guess, so a plain merge could re-point an account the
//     school already filed (41500 development → other).
// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, act, waitFor, cleanup } from '@testing-library/react'
import * as XLSX from 'xlsx'

const mergeEntries = vi.fn(async () => ({ data: {} }))
vi.mock('../lib/api.js', () => ({
  importsApi: {},
  mappingApi: { mergeEntries: (...a) => mergeEntries(...a) },
}))
vi.mock('../lib/intakeMemory.js', () => ({
  getIntakeMemory: async () => null,
  invalidateIntakeMemory: () => {},
}))
const persistence = {
  historyComparatives: {},
  periods: [],
  refresh: async () => {},
  savePeriods: async () => ({ saved: [], failed: [] }),
  saveState: 'idle',
  savedPeriodLabel: null,
  latestSnapshot: null,
}
vi.mock('./PersistenceContext.jsx', () => ({ usePersistence: () => persistence }))

const { AppProvider, useApp } = await import('./AppContext.jsx')

let app = null
function Grab() {
  app = useApp()
  return null
}
const mount = () =>
  render(
    <AppProvider school={{ id: 'school-s1' }}>
      <Grab />
    </AppProvider>,
  )

beforeEach(() => {
  mergeEntries.mockClear()
  app = null
  cleanup()
  try {
    sessionStorage.clear()
  } catch {
    /* none */
  }
})

describe('N2 — the popup’s save', () => {
  it('the person’s picks go as a normal merge; untouched suggestions fill-only', async () => {
    mount()
    let ok
    await act(async () => {
      ok = await app.mapAccounts(
        { 1010: 'cash', 4823: 'other', 5010: 'instrSal' },
        { onlyNew: true, chosen: new Set(['4823']) },
      )
    })
    expect(ok).toBe(true)
    expect(mergeEntries).toHaveBeenCalledTimes(2)
    expect(mergeEntries.mock.calls[0]).toEqual(['school-s1', { 1010: 'cash', 5010: 'instrSal' }, { onlyNew: true }])
    expect(mergeEntries.mock.calls[1]).toEqual(['school-s1', { 4823: 'other' }])
  })

  it('nothing chosen → ONE fill-only request', async () => {
    mount()
    await act(async () => {
      await app.mapAccounts({ 1010: 'cash' }, { onlyNew: true, chosen: new Set() })
    })
    expect(mergeEntries).toHaveBeenCalledTimes(1)
    expect(mergeEntries.mock.calls[0][2]).toEqual({ onlyNew: true })
  })

  it('the old one-account mapAccount is gone (N3)', () => {
    mount()
    expect(app.mapAccount).toBeUndefined()
  })
})

describe('S1 — renumbering carries the category FILL-ONLY', () => {
  it('a KYRO-numbered account given a new number writes { [to]: cat } with onlyNew', async () => {
    // A QuickBooks Profit and Loss with NO account numbers: KYRO numbers them.
    const ws = XLSX.utils.aoa_to_sheet([
      ['Sunny Day School'],
      ['Profit and Loss'],
      ['July 2025 - June 2026'],
      [],
      ['', 'Total'],
      ['Income'],
      ['   Tuition', 512000],
      ['Total Income', 512000],
      ['Expenses'],
      ['   Salaries - Faculty', 452000],
      ['Total Expenses', 452000],
      ['Net Income', 60000],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'P&L')
    const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    mount()
    const file = new File([bytes], 'Sunny P&L 6-30-26.xlsx')
    act(() => app.loadFiles([file]))
    await waitFor(() => expect(app.files.some((f) => f.status === 'ready')).toBe(true))
    const f = app.files.find((x) => x.status === 'ready')
    const synth = (f.metadata?.statement?.synthesized || []).find((s) => s.section === 'revenue')
    expect(synth).toBeTruthy()
    const from = synth.acct
    // Give the KYRO-numbered account a category in this tab (a session pick).
    await act(async () => {
      await app.mapAccounts({ [String(from)]: 'tuition' })
    })
    mergeEntries.mockClear()
    let msg
    act(() => {
      msg = app.renumberAccount(f.id, from, '49123')
    })
    expect(msg).toBeNull()
    await waitFor(() => expect(mergeEntries).toHaveBeenCalledTimes(1))
    expect(mergeEntries.mock.calls[0]).toEqual(['school-s1', { 49123: 'tuition' }, { onlyNew: true }])
  })
})

describe('after "Use these columns", the file takes This year’s slot (no "Choose role")', () => {
  it('an unreadable file read with picked columns lands in This year, confirmed', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Sunny Day School'],
      ['Trial Balance June 30, 2026'],
      ['Acct', 'Desc', null],
      [1010, 'Cash', 250_000],
      [1200, 'Tuition Receivable', 40_000],
      [2100, 'Accounts Payable', -30_000],
      [3000, 'Net Assets', -200_000],
      [4000, 'Tuition', -512_000],
      [5000, 'Salaries', 452_000],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1')
    const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
    mount()
    act(() => app.loadFiles([new File([bytes], 'Odd TB 6-30-26.xlsx')]))
    await waitFor(() => expect(app.files.some((f) => f.status === 'error')).toBe(true))
    const bad = app.files.find((f) => f.status === 'error')
    let ok
    act(() => {
      ok = app.applyColumns(bad.id, { ...bad.failure.preview.guess, amount: 2, debit: -1, credit: -1 })
    })
    expect(ok).toBe(true)
    await waitFor(() => expect(app.files.find((f) => f.id === bad.id)?.status).toBe('ready'))
    const f = app.files.find((x) => x.id === bad.id)
    expect(f.role).toBe('cy')
    expect(f.roleConfirmed).toBe(true)
    expect(app.byRole.cy?.id).toBe(bad.id)
  })
})
