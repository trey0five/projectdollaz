// ─────────────────────────────────────────────────────────────
// Regression truth: locks the SOA/SFP/SCF/netAssets numbers produced by
// the engine on sample-data (CY FY26 + PY/Audit FY25). The sample data is
// internally consistent (see the "internal consistency" block): each TB's
// imbalance == its opening net assets, the balance sheet balances, FY25
// rolls forward into FY26, and the cash-flow statement reconciles.
// Regenerate sample-data + fixture with: node scripts/gen-sample-data.mjs
// ─────────────────────────────────────────────────────────────
import { describe, it, expect } from 'vitest'
import { generateReports, validateDataset, deriveOpeningNetAssets } from '../src/index.js'
import { cyData, pyData, auditData, school } from './fixtures.js'

const out = generateReports({ cyData, pyData, auditData, school })

describe('SOA regression', () => {
  const { cy, py, audit, cyNAEnd } = out.soaResults
  it('cy totals', () => {
    expect(cy.totalRev).toBe(10850000)
    expect(cy.totalExp).toBe(10420000)
    expect(cy.netChange).toBe(430000)
    expect(cyNAEnd).toBe(8300000)
  })
  it('py / audit net change', () => {
    expect(py!.netChange).toBe(370000)
    expect(audit!.netChange).toBe(370000)
  })
})

describe('SFP regression (cy)', () => {
  const cy = out.sfpResults.cy!
  it('asset/liability/NA lines', () => {
    expect(cy.cash).toBe(1230000)
    expect(cy.tuitionRec).toBe(650000)
    expect(cy.prepaid).toBe(160000)
    expect(cy.totalCurrentA).toBe(2040000)
    expect(cy.ppNet).toBe(5980000)
    expect(cy.totalAssets).toBe(9620000)
    expect(cy.totalLiab).toBe(1320000)
    expect(cy.totalNA).toBe(8300000)
  })
})

describe('SCF regression', () => {
  const s = out.scf!
  it('cash flow sections', () => {
    expect(s.depr).toBe(520000)
    expect(s.operatingCash).toBe(960000)
    expect(s.investingCash).toBe(-100000)
    expect(s.financingCash).toBe(-50000)
    expect(s.netCashChange).toBe(810000)
    expect(s.cashBegin).toBe(420000)
    expect(s.cashEnd).toBe(1230000)
  })
})

describe('Net Assets statement', () => {
  it('cy begin + change -> end with donor split', () => {
    const cy = out.netAssets.cy
    expect(cy.begin).toBe(7870000)
    expect(cy.change).toBe(430000)
    expect(cy.end).toBe(8300000)
    expect(cy.withoutDonor + cy.withDonor).toBe(cy.end)
    expect(cy.end).toBe(out.sfpResults.cy!.totalNA)
  })
  it('py / audit change pulled from SOA net change', () => {
    expect(out.netAssets.py!.change).toBe(370000)
    expect(out.netAssets.audit!.change).toBe(370000)
  })
})

describe('internal consistency (articulation)', () => {
  it('each TB imbalance equals its opening net assets (recoverable)', () => {
    expect(deriveOpeningNetAssets(cyData).value).toBe(school.netAssetsBegin)
    expect(deriveOpeningNetAssets(pyData).value).toBe(school.pyNetAssetsBegin)
    expect(deriveOpeningNetAssets(auditData).value).toBe(school.auditNetAssetsBegin)
  })
  it('the balance sheet balances for every year', () => {
    for (const sfp of [out.sfpResults.cy, out.sfpResults.py, out.sfpResults.audit]) {
      expect(sfp!.totalAssets).toBe(sfp!.totalLiabNA)
    }
  })
  it('FY25 ending net assets rolls forward into FY26 opening', () => {
    expect(out.soaResults.pyNAEnd).toBe(out.soaResults.cyNABegin)
  })
  it('the cash-flow statement reconciles', () => {
    const s = out.scf!
    expect(s.netCashChange).toBe(s.cashEnd - s.cashBegin)
  })
})

describe('validation', () => {
  it('clean sample data has no unmapped accounts', () => {
    expect(out.unmapped).toHaveLength(0)
    expect(out.validation.issues.some((i) => i.code === 'UNMAPPED_ACCOUNT')).toBe(false)
  })
  it('management TBs omit opening equity — reported, not a false alarm', () => {
    const v = out.validation
    // The sample management TBs OMIT the opening net-assets/equity row
    // (beginning balance supplied out-of-band), so the engine does NOT raise a
    // false UNBALANCED alarm: balanced is TRUE. Raw totals report the residual
    // (the difference == the opening net assets).
    expect(v.balanced).toBe(true)
    expect(v.totalDebits).toBe(23060000)
    expect(v.totalCredits).toBe(15190000)
    expect(v.difference).toBe(7870000)
    expect(v.difference).toBeCloseTo(v.totalDebits - v.totalCredits, 6)
    expect(v.issues.some((i) => i.code === 'UNBALANCED')).toBe(false)
    expect(
      v.issues.some((i) => i.code === 'OPENING_EQUITY_EXTERNAL' && i.severity === 'info')
    ).toBe(true)
  })

  it('a COMPLETE TB (with an equity/opening row) IS strictly checked', () => {
    // Inject a 300-series equity credit that does NOT offset the imbalance,
    // proving the strict debits=credits assertion fires for complete TBs.
    const withEquity = [...cyData, { acct: 350, desc: 'Net assets — opening', total: -1 }]
    const v = validateDataset(withEquity)
    expect(v.balanced).toBe(false)
    expect(v.issues.some((i) => i.code === 'UNBALANCED' && i.severity === 'error')).toBe(true)

    // And it reports balanced=true when the equity row makes it net to zero
    // (the offsetting credit equals the imbalance == the opening net assets).
    const balancedTB = [...cyData, { acct: 350, desc: 'Net assets — opening', total: -7870000 }]
    const vb = validateDataset(balancedTB)
    expect(vb.balanced).toBe(true)
    expect(vb.difference).toBeCloseTo(0, 6)
    expect(vb.issues.some((i) => i.code === 'UNBALANCED')).toBe(false)
  })
})

describe('engine determinism (pure function of inputs)', () => {
  it('two calls with identical inputs return deep-equal bundles', () => {
    const a = generateReports({ cyData, pyData, auditData, school })
    const b = generateReports({ cyData, pyData, auditData, school })
    expect(a).toEqual(b)
    // No clock read by default.
    expect(a.meta.generatedAt).toBeUndefined()
  })
  it('caller-supplied generatedAt is passed through unchanged', () => {
    const stamp = '2026-01-01T00:00:00.000Z'
    const r = generateReports({ cyData, pyData, auditData, school, generatedAt: stamp })
    expect(r.meta.generatedAt).toBe(stamp)
  })
})

describe('meta versions', () => {
  it('carries engine/mapping/chart versions', () => {
    expect(out.meta.engineVersion).toBeTruthy()
    expect(out.meta.mappingVersion).toBe('map-v1')
    expect(out.meta.standardChartVersion).toBe('scoa-v1')
  })
})
