import { describe, expect, it } from 'vitest'
import { generateReports, DEFAULT_CHART, type ReportBundle } from '@finrep/engine'
import { computeMetricsForPeriod, computeTrend, fromBundle, missingBalanceSheet } from '../src/index.js'

// ─────────────────────────────────────────────────────────────────────────────
// A P&L-only year (statement partial 'pl': no Balance Sheet in the save) must not
// read as "Days cash on hand: 0 days — at risk" or a made-up operating reserve.
// The engine still builds an SFP from it (every asset line 0, net assets = the
// opening figure + the year's change), so the adapter judges the SFP by its
// LINEAGE: no balance-sheet line backed by a single trial-balance row = no
// balance sheet. Built through the real engine so the fixture can't drift.
// ─────────────────────────────────────────────────────────────────────────────

const school = { netAssetsBegin: 250000, pyNetAssetsBegin: 0, auditNetAssetsBegin: 0 }
const PL = [
  { acct: 401, desc: 'Tuition', total: -900000 },
  { acct: 500, desc: 'Teacher salaries', total: 700000 },
  { acct: 701, desc: 'Facilities', total: 150000 },
]
const BS = [
  { acct: 100, desc: 'Operating cash', total: 380000 },
  { acct: 200, desc: 'Accounts payable', total: -30000 },
]

const gen = (cy: typeof PL): ReportBundle =>
  generateReports({ cyData: cy as never, pyData: [], auditData: [], school, chart: DEFAULT_CHART })

const byKey = (b: ReportBundle) =>
  Object.fromEntries(computeMetricsForPeriod({ current: b }).map((m) => [m.key, m]))

describe('a year with no balance sheet', () => {
  it('★ P&L-only: days cash + operating reserve are UNAVAILABLE with a reason, never 0', () => {
    const plOnly = gen(PL)
    expect(plOnly.sfpResults.cy).not.toBeNull() // the engine still builds one…
    expect(missingBalanceSheet(plOnly)).toBe('needs-balance-sheet') // …but nothing backs it

    const m = byKey(plOnly)
    for (const key of ['days_cash_on_hand', 'months_operating_reserve'] as const) {
      expect(m[key].available).toBe(false)
      expect(m[key].value).toBeNull()
      expect(m[key].status).toBe('neutral')
      expect(m[key].reason).toBe('needs-balance-sheet')
    }
    // P&L metrics are untouched and carry no reason.
    expect(m.operating_margin.available).toBe(true)
    expect(m.operating_margin.reason).toBeUndefined()
    expect(fromBundle(plOnly).cash).toBeNull()
  })

  it('full P&L + balance sheet: balance-sheet metrics compute as before (no reason field)', () => {
    const full = gen([...PL, ...BS])
    expect(missingBalanceSheet(full)).toBeNull()
    const m = byKey(full)
    expect(m.days_cash_on_hand.available).toBe(true)
    expect(Math.round(m.days_cash_on_hand.value as number)).toBe(163)
    expect('reason' in m.days_cash_on_hand).toBe(false)
    expect(fromBundle(full)).not.toHaveProperty('balanceSheetMissing')
  })

  it('balance-sheet accounts present but none sorted → "balance-sheet-unsorted"', () => {
    const b = gen([...PL, { acct: 1099, desc: 'Mystery asset', total: 5000 }])
    // Force the "nothing sourced" shape the engine produces for an unsorted sheet.
    const unsorted: ReportBundle = {
      ...b,
      unmapped: [{ acct: 1099, desc: 'Mystery asset', total: 5000 }] as never,
      lineage: b.lineage && {
        ...b.lineage,
        sfp: {
          ...b.lineage.sfp,
          cy: Object.fromEntries(
            Object.entries(b.lineage.sfp.cy ?? {}).map(([k, l]) => [k, { ...l, sources: [] }]),
          ),
        },
      },
    }
    expect(missingBalanceSheet(unsorted)).toBe('balance-sheet-unsorted')
    expect(byKey(unsorted).days_cash_on_hand.reason).toBe('balance-sheet-unsorted')
  })

  it('no SFP at all → needs-balance-sheet; a legacy snapshot without lineage is trusted as before', () => {
    const full = gen([...PL, ...BS])
    expect(missingBalanceSheet({ ...full, sfpResults: { ...full.sfpResults, cy: null } })).toBe('needs-balance-sheet')
    expect(missingBalanceSheet({ ...full, lineage: undefined })).toBeNull()
  })

  it('the trend series shows a P&L-only year as unavailable, not a 0', () => {
    const trend = computeTrend('days_cash_on_hand', [
      { periodId: 'a', label: 'FY25', periodEndDate: '2025-06-30', bundle: gen([...PL, ...BS]) },
      { periodId: 'b', label: 'FY26', periodEndDate: '2026-06-30', bundle: gen(PL) },
    ] as never)
    const pts = (trend as { points: Array<{ available: boolean; value: number | null }> }).points
    expect(pts.map((p) => p.available)).toEqual([true, false])
    expect(pts[1].value).toBeNull()
  })
})
