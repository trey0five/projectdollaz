// Unit tests for the PURE cash-flow reconciliation briefing builder. Pins: it fires
// ONLY when reconStatus is 'differs' AND a STRONG check is material (edge-triggered);
// severity is warn for one break, critical for both; nothing on a tie / immaterial gap
// / null row; and value-safety (aggregate $ deltas only, figures placed verbatim so
// the narration numeric-guard passes; no accounts/parties/PII).
import { describe, expect, it } from 'vitest'
import { buildReconciliationItems } from './briefing-reconciliation.js'
import type { CashFlowSnapshot } from '@finrep/db'

const NOW = '2026-07-07T00:00:00.000Z'

function row(over: Partial<CashFlowSnapshot> & { detail?: unknown } = {}): CashFlowSnapshot {
  return {
    id: 'cf-1',
    schoolId: 'school-1',
    fiscalPeriodId: 'period-1',
    realmId: 'realm-1',
    environment: 'sandbox',
    source: 'cashflow',
    capturedVia: 'sync',
    operating: -48000,
    investing: -5000,
    financing: 12000,
    netChange: -41000,
    openingCash: 32000,
    monthlyBurn: -4000,
    runwayMonths: 8,
    reconStatus: 'tied',
    cashDiff: null,
    netIncomeDiff: null,
    cashChangeDiff: null,
    cashTie: true,
    netIncomeTie: true,
    detail: null,
    capturedAt: new Date('2026-07-05T00:00:00.000Z'),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  } as unknown as CashFlowSnapshot
}

describe('buildReconciliationItems', () => {
  it('returns [] for a null row (not connected / never captured)', () => {
    expect(buildReconciliationItems(null, NOW)).toEqual([])
  })

  it('returns [] when the books TIE (honest non-signal — the green badge lives on the page)', () => {
    expect(buildReconciliationItems(row({ reconStatus: 'tied' }), NOW)).toEqual([])
  })

  it('returns [] when differs but NO strong check is material (immaterial gap, amber on page only)', () => {
    const r = row({
      reconStatus: 'differs',
      cashTie: false,
      cashDiff: 600,
      detail: { cash: { material: false }, net_income: { material: false }, cash_change: null },
    })
    expect(buildReconciliationItems(r, NOW)).toEqual([])
  })

  it('fires WARN for a single material strong break, value-safe', () => {
    const r = row({
      reconStatus: 'differs',
      cashTie: false,
      cashDiff: 15000,
      netIncomeDiff: 0,
      detail: { cash: { material: true }, net_income: { material: false }, cash_change: null },
    })
    const items = buildReconciliationItems(r, NOW)
    expect(items).toHaveLength(1)
    const it = items[0]
    expect(it.id).toBe('cash:reconciliation')
    expect(it.severity).toBe('warn')
    expect(it.source).toBe('cash')
    expect(it.link).toBe('/cash')
    // Value-safe: the $ delta is placed verbatim; no account/party names.
    expect(it.why).toContain('$15,000')
    expect(it.why).not.toMatch(/invoice|vendor|customer|account #/i)
  })

  it('escalates to CRITICAL when BOTH cash AND net income break materially', () => {
    const r = row({
      reconStatus: 'differs',
      cashTie: false,
      netIncomeTie: false,
      cashDiff: 15000,
      netIncomeDiff: -9000,
      detail: { cash: { material: true }, net_income: { material: true }, cash_change: null },
    })
    const items = buildReconciliationItems(r, NOW)
    expect(items).toHaveLength(1)
    expect(items[0].severity).toBe('critical')
    expect(items[0].why).toContain('$15,000')
    expect(items[0].why).toContain('-$9,000')
  })
})
